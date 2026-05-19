/**
 * csr-generator — Unit Tests (real crypto, no mocks)
 *
 * Tests CSR generation and P12 bundling with actual forge operations.
 * Verifies round-trip: generate → parse back → values match.
 */

import { describe, it, expect } from 'vitest';
import forge from 'node-forge';
import { generateKeyPairAndCsr, bundleP12 } from '../csr-generator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a self-signed test certificate for bundleP12 tests.
 * Returns base64-encoded DER cert + the matching private key PEM.
 */
function generateTestCert(): { certDerBase64: string; privateKeyPem: string } {
  const keyPair = forge.pki.rsa.generateKeyPair({ bits: 2048 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keyPair.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 86400000);
  cert.setSubject([{ name: 'commonName', value: 'Test Cert' }]);
  cert.setIssuer([{ name: 'commonName', value: 'Test Cert' }]);
  cert.sign(keyPair.privateKey, forge.md.sha256.create());

  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const certDerBase64 = forge.util.encode64(certDer);
  const privateKeyPem = forge.pki.privateKeyToPem(keyPair.privateKey);

  return { certDerBase64, privateKeyPem };
}

// ---------------------------------------------------------------------------
// Tests: generateKeyPairAndCsr
// ---------------------------------------------------------------------------

describe('generateKeyPairAndCsr', () => {
  it('returns both privateKeyPem and csrPem', () => {
    const result = generateKeyPairAndCsr();

    expect(result.privateKeyPem).toBeDefined();
    expect(result.csrPem).toBeDefined();
    expect(result.privateKeyPem.length).toBeGreaterThan(100);
    expect(result.csrPem.length).toBeGreaterThan(100);
  });

  it('privateKeyPem starts with RSA PRIVATE KEY header', () => {
    const { privateKeyPem } = generateKeyPairAndCsr();

    expect(privateKeyPem.trimStart()).toMatch(/^-----BEGIN RSA PRIVATE KEY-----/);
  });

  it('csrPem starts with CERTIFICATE REQUEST header', () => {
    const { csrPem } = generateKeyPairAndCsr();

    expect(csrPem.trimStart()).toMatch(/^-----BEGIN CERTIFICATE REQUEST-----/);
  });

  it('CSR parses back with correct CN and 2048-bit RSA key', () => {
    const { csrPem } = generateKeyPairAndCsr('My Custom CN');

    const csr = forge.pki.certificationRequestFromPem(csrPem);

    // Verify CN
    const cn = csr.subject.getField('CN');
    expect(cn.value).toBe('My Custom CN');

    // Verify RSA-2048
    const pubKey = csr.publicKey as forge.pki.rsa.PublicKey;
    expect(pubKey.n.bitLength()).toBe(2048);
  });

  it('CSR signature verifies against its own public key', () => {
    const { csrPem } = generateKeyPairAndCsr();

    const csr = forge.pki.certificationRequestFromPem(csrPem);
    const verified = csr.verify();

    expect(verified).toBe(true);
  });

  it('default commonName is "Apple Distribution"', () => {
    const { csrPem } = generateKeyPairAndCsr();

    const csr = forge.pki.certificationRequestFromPem(csrPem);
    const cn = csr.subject.getField('CN');

    expect(cn.value).toBe('Apple Distribution');
  });

  it('each call produces different keys', () => {
    const result1 = generateKeyPairAndCsr();
    const result2 = generateKeyPairAndCsr();

    expect(result1.privateKeyPem).not.toBe(result2.privateKeyPem);
    expect(result1.csrPem).not.toBe(result2.csrPem);
  });
});

// ---------------------------------------------------------------------------
// Tests: bundleP12
// ---------------------------------------------------------------------------

describe('bundleP12', () => {
  it('produces a base64-encoded .p12 from cert + key', () => {
    const { certDerBase64, privateKeyPem } = generateTestCert();

    const p12Base64 = bundleP12(certDerBase64, privateKeyPem, 'testpass123');

    expect(p12Base64.length).toBeGreaterThan(100);
    // Verify it's valid base64
    const decoded = Buffer.from(p12Base64, 'base64');
    expect(decoded.length).toBeGreaterThan(0);
    // .p12 starts with ASN.1 SEQUENCE tag (0x30)
    expect(decoded[0]).toBe(0x30);
  });

  it('.p12 can be unbundled with the correct password', () => {
    const { certDerBase64, privateKeyPem } = generateTestCert();
    const password = 'correct-password';

    const p12Base64 = bundleP12(certDerBase64, privateKeyPem, password);

    // Unbundle
    const p12Der = forge.util.decode64(p12Base64);
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

    // Extract cert bags
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certs = certBags[forge.pki.oids.certBag];
    expect(certs).toBeDefined();
    expect(certs!.length).toBeGreaterThan(0);
    expect(certs![0]!.cert!.subject.getField('CN').value).toBe('Test Cert');

    // Extract key bags
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const keys = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag];
    expect(keys).toBeDefined();
    expect(keys!.length).toBeGreaterThan(0);
    expect(keys![0]!.key).toBeDefined();
  });

  it('wrong password throws on unbundle', () => {
    const { certDerBase64, privateKeyPem } = generateTestCert();

    const p12Base64 = bundleP12(certDerBase64, privateKeyPem, 'real-password');

    const p12Der = forge.util.decode64(p12Base64);
    const p12Asn1 = forge.asn1.fromDer(p12Der);

    expect(() => {
      forge.pkcs12.pkcs12FromAsn1(p12Asn1, 'wrong-password');
    }).toThrow();
  });
});

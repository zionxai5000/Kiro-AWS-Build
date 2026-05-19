/**
 * CSR Generator + P12 Bundler
 *
 * Generates RSA-2048 key pairs and Certificate Signing Requests (CSRs)
 * for Apple Distribution certificates. Bundles signed certs + private
 * keys into PKCS#12 (.p12) format for upload to EAS.
 *
 * Uses node-forge for all crypto operations (no mixing with Node crypto).
 */

import forge from 'node-forge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KeyPairAndCsr {
  /** RSA-2048 private key in PEM format (PKCS#1) */
  privateKeyPem: string;
  /** Certificate Signing Request in PEM format */
  csrPem: string;
}

// ---------------------------------------------------------------------------
// CSR Generation
// ---------------------------------------------------------------------------

/**
 * Generate an RSA-2048 key pair and a CSR for Apple Distribution cert.
 *
 * Stateless — generates a fresh keypair every call.
 * The private key MUST be kept in memory only, never written to disk
 * except via withTempFile pattern.
 *
 * @param commonName - Subject CN (default: "Apple Distribution")
 * @returns { privateKeyPem, csrPem }
 */
export function generateKeyPairAndCsr(
  commonName = 'Apple Distribution',
): KeyPairAndCsr {
  // Generate RSA-2048 key pair
  const keyPair = forge.pki.rsa.generateKeyPair({ bits: 2048 });

  // Create CSR
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = keyPair.publicKey;
  csr.setSubject([{ name: 'commonName', value: commonName }]);

  // Sign CSR with SHA-256
  csr.sign(keyPair.privateKey, forge.md.sha256.create());

  // Export to PEM
  const privateKeyPem = forge.pki.privateKeyToPem(keyPair.privateKey);
  const csrPem = forge.pki.certificationRequestToPem(csr);

  return { privateKeyPem, csrPem };
}

// ---------------------------------------------------------------------------
// P12 Bundling
// ---------------------------------------------------------------------------

/**
 * Bundle a signed certificate + private key into PKCS#12 (.p12) format.
 *
 * @param certDerBase64 - Base64-encoded DER certificate (from Apple's response)
 * @param privateKeyPem - PEM private key (from generateKeyPairAndCsr)
 * @param password - Password to encrypt the .p12 bundle
 * @returns Base64-encoded .p12 content (ready for EAS upload)
 */
export function bundleP12(
  certDerBase64: string,
  privateKeyPem: string,
  password: string,
): string {
  // Decode the DER certificate from base64
  const certDerBytes = forge.util.decode64(certDerBase64);
  const certAsn1 = forge.asn1.fromDer(certDerBytes);
  const cert = forge.pki.certificateFromAsn1(certAsn1);

  // Parse the private key from PEM
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);

  // Bundle into PKCS#12 with 3DES encryption (Apple/macOS compatible)
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(privateKey, [cert], password, {
    algorithm: '3des',
  });

  // Convert ASN.1 to DER bytes, then base64
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  return forge.util.encode64(p12Der);
}

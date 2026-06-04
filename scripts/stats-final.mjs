import sharp from 'sharp';
const files = ['01-initial.png', '03-add-modal.png', '04-after-save.png', '05-completed.png'];
for (const f of files) {
  const s = await sharp('scripts/final-screens/' + f).stats();
  const c = s.channels.slice(0, 3);
  const b = Math.round(c.reduce((a, x) => a + x.mean, 0) / 3);
  const v = Math.round(c.reduce((a, x) => a + x.stdev * x.stdev, 0) / 3);
  console.log(f, 'brightness=' + b, 'variance=' + v);
}

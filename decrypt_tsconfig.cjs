const crypto = require('crypto');
const fs = require('fs');

const ENCRYPTION_PREFIX = 'ENC:v1:';
const ALGO = 'AES-GCM';
const KEY_LENGTH = 256;
const PBKDF2_ITERATIONS = 100000;
const SALT = 'runy-dic-salt-v1';

const LEGACY_PASSPHRASES = [
  'RunyDic2024SecretKey!@#$%^&*()_+-=[]{}|;\':\\",./<>?',
  'RunyDic2024SecretKey!@#$%^&*()_+-=[]{}|;:\'",./<>?'
];

const data = fs.readFileSync('tsconfig.json', 'utf8').trim();

if (!data.startsWith(ENCRYPTION_PREFIX)) {
  console.log('File is not encrypted');
  process.exit(0);
}

const base64 = data.slice(ENCRYPTION_PREFIX.length);
const binary = Buffer.from(base64, 'base64');
const iv = binary.slice(0, 12);
const ciphertext = binary.slice(12);

for (const passphrase of LEGACY_PASSPHRASES) {
  try {
    const key = crypto.pbkdf2Sync(passphrase, SALT, PBKDF2_ITERATIONS, KEY_LENGTH / 8, 'sha256');
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    const plaintext = decrypted.toString('utf8');
    console.log('SUCCESS with passphrase:', passphrase.substring(0, 20) + '...');
    console.log('---');
    console.log(plaintext);
    process.exit(0);
  } catch (e) {
    console.log('Failed with passphrase:', passphrase.substring(0, 20) + '...');
  }
}

console.log('All passphrases failed');

const pem = require('pem');
const fs = require('fs');
const mkdirp = require('mkdirp');

const SRV_DIR = 'keys/srv';
const JWT_DIR = 'keys/jwt';

mkdirp(SRV_DIR, err => {
  if (err) return console.error(err);
  mkdirp(JWT_DIR, err => {
    if (err) return console.error(err);
    createAllKeys();
  });
});

function createAllKeys() {
  createKeys(SRV_DIR, err => {
    if (err) return console.error(err);
    createKeys(JWT_DIR, err => {
      if (err) return console.error(err);
    });
  });
}

function createKeys(dir, cb) {
  pem.createCertificate({
    days: 1,
    selfSigned: true,
  }, (err, keys) => {
    if (err) return cb(err);
    pem.getPublicKey(keys.certificate, (err, res) => {
      if (err) return cb(err);
      fs.writeFileSync(dir + '/cert.pem', keys.certificate);
      fs.writeFileSync(dir + '/prv.pem', keys.serviceKey);
      fs.writeFileSync(dir + '/pub.pem', res.publicKey);
      cb(null);
    });
  });
}
const fs = require('fs');
const jose = require('node-jose');
const restify = require('restify');
const util = require('util');
const VError = require('verror').VError;

const SRV_DIR = 'keys/srv';
const JWT_DIR = 'keys/jwt';

let srvCertPem;
let srvPrvKeyPem;
let jwtVerifyKeyPem;
try {
  srvCertPem = fs.readFileSync(SRV_DIR + '/cert.pem');
  srvPrvKeyPem = fs.readFileSync(SRV_DIR + '/prv.pem');
  jwtVerifyKeyPem = fs.readFileSync(JWT_DIR + '/pub.pem');
} catch (e) {
  console.error('Can\'t read keys/certficates, has genKeys.js been run?');
  process.exit(1);
}

const httpServer = restify.createServer();
const httpsServerOpts = {
  certificate: srvCertPem,
  key: srvPrvKeyPem,
};
const httpsServer = restify.createServer(httpsServerOpts);

configureServer(httpServer);
configureServer(httpsServer);

httpServer.listen(getHttpPort(), () => {
  console.log('%s listening on %s', httpServer.name, httpServer.url);
});
httpsServer.listen(getHttpsPort(), () => {
  console.log('%s listening on %s', httpsServer.name, httpsServer.url);
});

function configureServer(server) {
  server.use(restify.bodyParser());
  server.post('/context-service/context', postDoc);
}

function getHttpPort() {
  return process.env.httpPort || process.env.HTTPPORT || 8017;
}

function getHttpsPort() {
  return process.env.port || process.env.PORT || 4017;
}

function postDoc(req, res, next) {
  const body = req.body;
  // console.log('postDoc: req body:\n%s', require('util').inspect(body));
  if (!body) return next(new restify.InvalidContentError('Bad content'));
  const accountId = body.accountId;
  const data = body.contextData;
  if (!accountId || !data) return next(new restify.InvalidContentError('Bad content'));
  verifyData(accountId, data, (err, contents) => {
    if (err) return next(new restify.BadRequestError());
    if (!contents || !contents.contextId) return next(new restify.BadRequestError());
    const output = util.inspect(contents, {
      depth: null
    });
    console.log('%s Dummy context server, posted:\n  accountId:\n    %s\n  contents:\n%s', new Date().toString(), accountId, output.replace(/^/, '    ').replace(/\n/, '\n    '));
    res.send(201);
    return next();
  });
}

function verifyData(accountId, data, cb) {
  jose.JWK.asKey(jwtVerifyKeyPem, 'pem')
    .then(key => jose.JWS.createVerify(key).verify(data))
    .then(result => {
      const contents = result.payload.toString();
      let parsedContents;
      try {
        parsedContents = JSON.parse(contents);
      } catch (e) {
        return cb(new VError(e, 'Unable to parse context data'));
      }
      cb(null, parsedContents);
    })
    .catch(err => {
      cb(err);
    });
}
const assert = require('assert');
const describe = require('mocha').describe;
const it = require('mocha').it;
const nock = require('nock');

const cxAccId = 12345;
const cxAppKey = 'abcdef';
const cxConvDomain = 'a.b.c';

process.env.LA_ACCOUNT_ID = cxAccId;
process.env.LA_APP_KEY = cxAppKey;
const sut = require('../app.js');

nock.disableNetConnect();

function activeMock(scope) {
  // console.log('Active mocks: %s', scope.activeMocks());
}

describe('Chat', function() {

  describe('#getAvailability()', function() {

    const availabilityPath = `/api/account/${cxAccId}/chat/availability.json`;

    describe('when is available', function() {

      const getDomainMockScope = nock('http://api.liveperson.net')
        .get(`/api/account/${cxAccId}/service/conversationVep/baseURI.json`)
        .query({
          version: '1.0'
        })
        .times(2)
        .reply(200, {
          baseURI: cxConvDomain
        });
      activeMock(getDomainMockScope);

      const getAvailabilityMockScope = nock(`https://${cxConvDomain}`)
        .get(availabilityPath)
        .query({
          v: '1',
          appKey: cxAppKey
        })
        .times(2)
        .reply(200, {
          availability: true
        });
      activeMock(getAvailabilityMockScope);

      it('should report true availability (callback)', function(done) {
        const chat = new sut.Chat();
        chat.getAvailability({}, function(err, result) {
          if (err) return done(err);
          assert.equal(true, result.availability, 'Expected true availability');
          done();
        });
      });

      it('should report true availability (promise)', function(done) {
        const chat = new sut.Chat();
        chat.getAvailability({})
          .then(function(result) {
            assert.equal(true, result.availability, 'Expected true availability');
            done();
          }).catch(function(err) {
            done(err);
          });
      });
    });

    describe('when is not available', function() {

      const getDomainMockScope = nock('http://api.liveperson.net')
        .get(`/api/account/${cxAccId}/service/conversationVep/baseURI.json`)
        .query({
          version: '1.0'
        })
        .times(2)
        .reply(200, {
          baseURI: cxConvDomain
        });
      activeMock(getDomainMockScope);

      const getAvailabilityMockScope = nock(`https://${cxConvDomain}`)
        .get(availabilityPath)
        .query({
          v: '1',
          appKey: cxAppKey
        })
        .times(2)
        .reply(200, {
          availability: false
        });
      activeMock(getAvailabilityMockScope);

      it('should report false availability (callback)', function(done) {
        const chat = new sut.Chat();
        chat.getAvailability({}, function(err, result) {
          if (err) return done(err);
          assert.equal(false, result.availability, 'Expected true availability');
          done();
        });
      });

      it('should report false availability (promise)', function(done) {
        const chat = new sut.Chat();
        chat.getAvailability({})
          .then(function(result) {
            assert.equal(false, result.availability, 'Expected true availability');
            done();
          }).catch(function(err) {
            done(err);
          });
      });
    });
  });
});
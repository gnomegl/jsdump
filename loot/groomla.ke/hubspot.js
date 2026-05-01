/**
 * GROOM LAKE — HubSpot Form Submission Module
 *
 * Lightweight client-side integration with the HubSpot Forms API.
 * No HubSpot SDK required — direct POST to the submissions endpoint.
 *
 * Usage:
 *   GLHubSpot.submit('FORM_GUID', {
 *     firstname: 'Jane',
 *     lastname:  'Doe',
 *     email:     'jane@company.com',
 *     company:   'Acme',
 *     message:   'Hello'
 *   }).then(onSuccess).catch(onError);
 */
(function () {
  'use strict';

  var PORTAL_ID = '48849673';
  var ENDPOINT  = 'https://api.hsforms.com/submissions/v3/integration/submit/' + PORTAL_ID + '/';

  // HubSpot cookie (hubspotutk) for contact tracking
  function getHubspotCookie() {
    var match = document.cookie.match(/(?:^|;\s*)hubspotutk=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  /**
   * Submit form data to a HubSpot form.
   * @param {string}  formGuid  - HubSpot form GUID
   * @param {Object}  fields    - Key/value pairs matching HubSpot field names
   * @param {Object}  [opts]    - Optional: { pageName, pageUri }
   * @returns {Promise}
   */
  function submit(formGuid, fields, opts) {
    opts = opts || {};

    var fieldArray = [];
    for (var key in fields) {
      if (fields.hasOwnProperty(key) && fields[key] !== undefined && fields[key] !== null && fields[key] !== '') {
        fieldArray.push({ name: key, value: String(fields[key]) });
      }
    }

    var payload = {
      fields: fieldArray,
      context: {
        pageUri:  opts.pageUri  || window.location.href,
        pageName: opts.pageName || document.title
      }
    };

    // Attach HubSpot tracking cookie if present
    var hutk = getHubspotCookie();
    if (hutk) {
      payload.context.hutk = hutk;
    }

    return fetch(ENDPOINT + formGuid, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    }).then(function (res) {
      if (res.ok) return res.json();
      return res.text().then(function (txt) {
        var err = new Error('HubSpot submission failed: ' + res.status);
        err.status = res.status;
        err.body = txt;
        throw err;
      });
    });
  }

  // Form GUID registry — single source of truth
  var FORMS = {
    contact:            'f952038e-3771-4170-b12e-fc48c3866830',
    reaperIndividual:   '2d7e64b0-b25e-4274-97ea-1d13de9d11c7',
    reaperEnterprise:   'ade47019-1bb9-4dfd-affe-a29ffd2fa8b4',
    reaperGov:          'b3444205-4680-4b13-85c4-0c337a61fcf2'
  };

  // Expose globally
  window.GLHubSpot = {
    submit:   submit,
    FORMS:    FORMS,
    PORTAL:   PORTAL_ID
  };

})();

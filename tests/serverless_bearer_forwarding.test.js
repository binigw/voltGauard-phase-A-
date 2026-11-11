const assert = require('node:assert/strict');

process.env.VITE_SUPABASE_URL = 'https://project.example.invalid';
process.env.VITE_SUPABASE_ANON_KEY = 'public-anon-test';
process.env.VITE_API_BASE_URL = 'https://backend.example.invalid';
process.env.SIGMO_ADMIN_API_KEY = 'server-admin-test';

const registerMotor = require('../api/register-motor.js');
const deleteMotor = require('../api/delete-motor.js');
const motorAssets = require('../api/motor-assets.js');

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() { return body; },
  };
}

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    end(raw) { this.body = JSON.parse(raw); },
  };
}

const adminUser = { id: '00000000-0000-4000-8000-000000000001' };
const techUser = { id: '00000000-0000-4000-8000-000000000002' };

async function runProxy({ handler, req, role = 'admin', backendBody = {} }) {
  const calls = [];
  global.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/auth/v1/user')) {
      return response(200, role === 'admin' ? adminUser : techUser);
    }
    if (url.includes('/rest/v1/user_roles')) {
      return response(200, [{ role }]);
    }
    return response(200, backendBody);
  };
  const res = mockRes();
  await handler(req, res);
  return { calls, res };
}

async function main() {
  const token = 'caller-bearer-test';
  const auth = { authorization: `Bearer ${token}` };

  const register = await runProxy({
    handler: registerMotor,
    req: {
      method: 'POST', headers: auth,
      body: {
        motorId: 'MTR-SEC', mccPanelId: 'MCC', cabinetNumber: 'C1',
        lineZoneId: 'L1', nameplateKw: 5, ratedRpm: 1450, driveType: 'DOL',
      },
    },
    backendBody: { status: 'registered' },
  });
  assert.equal(register.res.statusCode, 200);
  const registerBackend = register.calls.at(-1);
  assert.equal(registerBackend.init.headers.Authorization, `Bearer ${token}`);
  assert.equal(registerBackend.init.headers['X-API-Key'], 'server-admin-test');
  assert.equal(JSON.parse(registerBackend.init.body).sessionToken, undefined);

  const deletion = await runProxy({
    handler: deleteMotor,
    req: { method: 'POST', headers: auth, body: { motorId: 'MTR-SEC' } },
    backendBody: { status: 'deleted' },
  });
  assert.equal(deletion.res.statusCode, 200);
  const deleteBackend = deletion.calls.at(-1);
  assert.equal(deleteBackend.init.headers.Authorization, `Bearer ${token}`);
  assert.equal(deleteBackend.init.headers['X-API-Key'], 'server-admin-test');

  const assets = await runProxy({
    handler: motorAssets,
    req: { method: 'GET', headers: auth },
    role: 'technician',
    backendBody: [{
      motor_id: 'MTR-SEC', mcc_panel_id: 'MCC', cabinet_number: 'C1',
      line_zone_id: 'L1', nameplate_kw: 5, rated_rpm: 1450,
      drive_type: 'DOL', downtime_cost_etb_per_hour: 100,
    }],
  });
  assert.equal(assets.res.statusCode, 200);
  const assetsBackend = assets.calls.at(-1);
  assert.equal(assetsBackend.init.headers.Authorization, `Bearer ${token}`);
  assert.equal(assetsBackend.init.headers['X-API-Key'], 'server-admin-test');
  assert.equal('downtime_cost_etb_per_hour' in assets.res.body.assets[0], false);

  const noSession = await runProxy({
    handler: deleteMotor,
    req: { method: 'POST', headers: {}, body: { motorId: 'MTR-SEC' } },
  });
  assert.equal(noSession.res.statusCode, 401);
  assert.equal(noSession.calls.length, 0);

  const techMutation = await runProxy({
    handler: registerMotor,
    req: {
      method: 'POST', headers: auth,
      body: {
        motorId: 'MTR-SEC', mccPanelId: 'MCC', cabinetNumber: 'C1',
        lineZoneId: 'L1', nameplateKw: 5, ratedRpm: 1450, driveType: 'DOL',
      },
    },
    role: 'technician',
  });
  assert.equal(techMutation.res.statusCode, 403);
  assert.equal(techMutation.calls.length, 2);

  console.log('RESULT: ALL SERVERLESS BEARER FORWARDING TESTS PASSED (14 assertions)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { CloudPlusClient } from './cloudplus.client';

describe('CloudPlusClient Click2Call', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.CLOUDPLUS_BASE_URL = 'https://pbx.example.test';
    process.env.CLOUDPLUS_USER = 'admin@galit.co2';
    process.env.CLOUDPLUS_PASS = 'secret';
    process.env.CLOUDPLUS_ORG = 'galit.co2';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  // The PBX routes the local pattern only: `+972…` was rejected on the spot, `05…` rang.
  it.each([
    ['0532495154', '0532495154'],
    ['053-2495154', '0532495154'],
    ['+972532495154', '0532495154'],
    ['00972532495154', '0532495154'],
    ['972532495154', '0532495154'],
    ['+97236123456', '036123456'],
    ['+14155550100', '0014155550100'],
  ])('normalizes %s to the local dialing format', (input, expected) => {
    expect(CloudPlusClient.toPbxNumber(input)).toBe(expected);
  });

  it('rejects a value that is not a phone number', () => {
    expect(() => CloudPlusClient.toPbxNumber('abc')).toThrow();
    expect(() => CloudPlusClient.toPbxNumber('123')).toThrow();
  });

  it('sends Click2Call as GET with the local-format dial2', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ data: { Response: 'OK', Uniqueid1: 'call-1' } }),
        ),
      );

    const result = await new CloudPlusClient().click2Call('203', '053-2495154');

    const [requestedUrl, options] = fetchMock.mock.calls[0];
    const url = new URL(String(requestedUrl));
    expect(url.pathname).toBe('/API/dialup.php');
    expect(url.searchParams.get('org')).toBe('galit.co2');
    expect(url.searchParams.get('dial1')).toBe('203');
    expect(url.searchParams.get('dial2')).toBe('0532495154');
    expect(options).not.toHaveProperty('method');
    expect(result).toMatchObject({
      ok: true,
      uniqueId: 'call-1',
      customerNumber: '0532495154',
    });
  });

  it('dials the customer first and the extension second in customer-first order', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ data: { Response: 'OK' } })));

    const result = await new CloudPlusClient().click2Call('201', '+972532495154', 'customer-first');

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get('dial1')).toBe('0532495154');
    expect(url.searchParams.get('dial2')).toBe('201');
    expect(result.customerNumber).toBe('0532495154');
  });

  it('uses the dedicated Click2Call credentials when they are set', async () => {
    process.env.CLOUDPLUS_DIAL_USER = 'webuser';
    process.env.CLOUDPLUS_DIAL_PASS = 'dial-secret';
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ data: { Response: 'OK' } })));

    await new CloudPlusClient().click2Call('201', '0532495154');

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get('user')).toBe('webuser');
    expect(url.searchParams.get('pass')).toBe('dial-secret');
    expect(url.searchParams.get('org')).toBe('galit.co2');
  });

  it('derives org from the verified CloudPlus user when CLOUDPLUS_ORG is absent', async () => {
    delete process.env.CLOUDPLUS_ORG;
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ data: { State: 'Idle' } })),
      );

    const status = await new CloudPlusClient().extensionStatus('203');

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get('org')).toBe('galit.co2');
    expect(status.state).toBe('Idle');
  });
});

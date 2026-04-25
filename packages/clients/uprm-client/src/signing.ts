import { createHash, createHmac } from 'node:crypto';

const DEFAULT_NOW = () => Date.now();

export type UprmSigningInput = {
  apiKey: string;
  method: string;
  path: string;
  body: string;
  now?: () => number;
};

export type UprmSignedRequest = {
  keyPrefix: string;
  timestamp: number;
  bodySha256: string;
  canonical: string;
  signature: string;
  authorization: string;
};

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function getKeyPrefix(apiKey: string): string {
  const [keyPrefix] = apiKey.split('.', 1);
  if (!keyPrefix || keyPrefix.length !== 8) {
    throw new Error('UPRM apiKey must include an 8-character key prefix');
  }
  return keyPrefix;
}

export function signUprmRequest(input: UprmSigningInput): UprmSignedRequest {
  const now = input.now ?? DEFAULT_NOW;
  const timestamp = Math.floor(now() / 1000);
  const keyPrefix = getKeyPrefix(input.apiKey);
  const keyHash = sha256Hex(input.apiKey);
  const bodySha256 = sha256Hex(input.body);
  const canonical = [String(timestamp), input.method.toUpperCase(), input.path, bodySha256].join(
    '\n',
  );
  const signature = createHmac('sha256', keyHash).update(canonical).digest('hex');

  return {
    keyPrefix,
    timestamp,
    bodySha256,
    canonical,
    signature,
    authorization: `UPRM-HMAC ${keyPrefix}:${timestamp}:${signature}`,
  };
}

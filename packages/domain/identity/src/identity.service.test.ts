import { describe, it, expect } from 'vitest';
import { normaliseEmail, IdentityError } from './identity.service';

describe('normaliseEmail', () => {
  it('lowercases and trims', () => {
    expect(normaliseEmail('  Foo@Bar.com  ')).toBe('foo@bar.com');
  });

  it('strips +subaddress', () => {
    expect(normaliseEmail('alice+shop@example.com')).toBe('alice@example.com');
  });

  it('strips dots from gmail.com local-part', () => {
    expect(normaliseEmail('a.l.i.c.e@gmail.com')).toBe('alice@gmail.com');
  });

  it('strips dots from googlemail.com too', () => {
    expect(normaliseEmail('bob.smith@googlemail.com')).toBe('bobsmith@googlemail.com');
  });

  it('leaves non-gmail dots alone', () => {
    expect(normaliseEmail('a.b@yahoo.com')).toBe('a.b@yahoo.com');
  });

  it('rejects missing @', () => {
    expect(() => normaliseEmail('no-at-sign')).toThrow(IdentityError);
  });
});

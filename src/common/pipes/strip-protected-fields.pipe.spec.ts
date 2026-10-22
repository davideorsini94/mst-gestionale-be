import { StripProtectedFieldsPipe, TRANSACTION_SERVER_FIELDS } from './strip-protected-fields.pipe';

describe('StripProtectedFieldsPipe', () => {
  it('toglie uuid, date tecniche, blind index e i campi del server', () => {
    const pipe = new StripProtectedFieldsPipe(TRANSACTION_SERVER_FIELDS);
    const body = {
      uuid: 'x',
      createdAt: '2020-01-01',
      updatedAt: '2020-01-01',
      subjectHash: 'h',
      emailHash: 'h',
      receiptMinioPath: 'ricevute/2025/altro.pdf',
      receiptNumber: 999,
      amountReview: 'CONFIRMED',
      amount: 10,
      subject: 'Mario',
    };
    expect(pipe.transform(body)).toEqual({ amount: 10, subject: 'Mario' });
  });

  it('lascia passare valori non oggetto', () => {
    const pipe = new StripProtectedFieldsPipe();
    expect(pipe.transform(undefined)).toBeUndefined();
    expect(pipe.transform('x')).toBe('x');
    expect(pipe.transform([1])).toEqual([1]);
  });
});

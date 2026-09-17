import assert from 'node:assert/strict';
import { classifyRiderError, riderErrorMessage } from './js/operations.js';

const cases = [
    ['duplicate phone', 'A rider with this phone already exists.', 'DUPLICATE_PHONE', 'A rider with this phone number already exists.'],
    ['duplicate constraint', 'duplicate key value violates unique constraint riders_normalized_phone_unique', 'DUPLICATE_PHONE', 'A rider with this phone number already exists.'],
    ['invalid phone', 'Invalid rider details.', 'INVALID_PHONE', 'Enter a valid Nigerian phone number.'],
    ['inactive campus', 'An active campus is required.', 'INVALID_CAMPUS', 'Please select an active campus.'],
    ['authorization', 'You are not authorized to add riders.', 'UNAUTHORIZED', 'You are not authorized to add riders.'],
    ['unknown', 'unexpected database failure with internal details', 'UNKNOWN', 'Unable to save rider. Please try again.']
];

let passed = 0;
for (const [name, source, code, message] of cases) {
    assert.equal(classifyRiderError(source), code, `${name} code`);
    assert.equal(riderErrorMessage(code), message, `${name} message`);
    passed += 1;
    console.log(`PASS: ${name}`);
}

assert.doesNotMatch(riderErrorMessage('UNKNOWN'), /postgres|sql|uuid|stack|token|policy/i);
console.log('PASS: safe messages do not expose internal database details');
console.log(`\n${passed + 1} passed, 0 failed`);

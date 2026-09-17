import assert from 'node:assert/strict';
import { customerProgressForOrder, mapCustomerOrder } from './js/api.js';

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`PASS: ${name}`); };
const progress = (status, fulfillment_type = 'PICKUP') => customerProgressForOrder({ status, fulfillment_type });

const pickupSteps = ['Submitted', 'Confirmed', 'Preparing', 'Ready for Pickup', 'Completed'];
const deliverySteps = ['Submitted', 'Confirmed', 'Preparing', 'Out for Delivery', 'Completed'];

test('ORDER_RECEIVED pickup starts at Submitted', () => {
    assert.deepEqual(progress('ORDER_RECEIVED'), { steps: pickupSteps, currentStep: 1, isComplete: false });
});

test('PAYMENT_CONFIRMED pickup reaches Confirmed', () => assert.equal(progress('PAYMENT_CONFIRMED').currentStep, 2));
test('PREPARING pickup reaches Preparing', () => assert.equal(progress('PREPARING').currentStep, 3));
test('READY_FOR_PICKUP reaches Ready for Pickup', () => assert.equal(progress('READY_FOR_PICKUP').currentStep, 4));
test('COMPLETED pickup completes every prior step', () => assert.deepEqual(progress('COMPLETED'), { steps: pickupSteps, currentStep: 5, isComplete: true }));
test('PREPARING delivery uses delivery steps', () => assert.deepEqual(progress('PREPARING', 'DELIVERY'), { steps: deliverySteps, currentStep: 3, isComplete: false }));
test('READY_FOR_DISPATCH delivery remains pre-transit', () => assert.equal(progress('READY_FOR_DISPATCH', 'DELIVERY').currentStep, 3));
test('RIDER_ASSIGNED delivery remains pre-transit', () => assert.equal(progress('RIDER_ASSIGNED', 'DELIVERY').currentStep, 3));
test('OUT_FOR_DELIVERY delivery reaches Out for Delivery', () => assert.equal(progress('OUT_FOR_DELIVERY', 'DELIVERY').currentStep, 4));
test('IN_TRANSIT delivery reaches Out for Delivery', () => assert.equal(customerProgressForOrder({ status: 'RIDER_ASSIGNED', fulfillment_type: 'DELIVERY', delivery_status: 'IN_TRANSIT' }).currentStep, 4));
test('DELIVERED delivery reaches final stage without changing status source', () => assert.equal(progress('DELIVERED', 'DELIVERY').currentStep, 5));
test('CANCELLED does not falsely advance progress', () => assert.equal(progress('CANCELLED').currentStep, 1));

test('multi-vendor mapping uses parent status, not an arbitrary child', () => {
    const order = mapCustomerOrder({
        id: 'internal-only', order_number: 'CLX-2026-0026', fulfillment_type: 'PICKUP',
        status: 'PREPARING', total_kobo: 50000,
        customer_order_payments: { status: 'PAID', payment_method: 'BANK_TRANSFER' },
        orders: [{ status: 'PREPARING' }, { status: 'PENDING' }]
    });
    assert.equal(order.statusStep, 3);
    assert.deepEqual(order.progressSteps, pickupSteps);
    assert.equal(order.paymentStatus, 'PAID');
});

test('pickup tracker never includes Out for Delivery', () => assert.ok(!progress('PREPARING').steps.includes('Out for Delivery')));

test('CLX-2026-0026 expected state is PAID and Preparing', () => {
    const order = mapCustomerOrder({
        order_number: 'CLX-2026-0026', fulfillment_type: 'PICKUP', status: 'PREPARING', total_kobo: 50000,
        customer_order_payments: { status: 'PAID' }, orders: []
    });
    assert.equal(order.status, 'Preparing');
    assert.equal(order.paymentStatus, 'PAID');
    assert.equal(order.statusStep, 3);
});

console.log(`\n${passed} passed, 0 failed`);

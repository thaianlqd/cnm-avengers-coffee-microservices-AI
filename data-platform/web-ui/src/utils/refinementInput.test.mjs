import test from 'node:test';
import assert from 'node:assert/strict';
import {refinementInputError} from './refinementInput.mjs';
test('rejects incomplete gibberish locally without claiming semantic validation',()=>{
 for(const value of ['dsfdsfsdfsd','kkllkk','12345','!'.repeat(5),'a '.repeat(501)]) assert(refinementInputError(value));
 for(const value of ['','donut','theo tỉnh','Top 5','Chỉ lọc Đà Nẵng','Hà Nội thôi','Đổi sang biểu đồ thanh ngang']) assert.equal(refinementInputError(value),'');
});

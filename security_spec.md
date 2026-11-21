# 7Sunday Meet Security Specification

## Data Invariants
1. **Strict Account Isolation**: Customer accounts (`accountType == 'customer'`) can never read internal employee profiles, employee chats (`employee_dm`, `employee_group`), internal meetings (`meetingScope == 'internal'`), departments, custom roles, integration configs, or audit logs.
2. **Privilege Escalation Prevention**: Users cannot self-assign administrative roles (`Super Administrator`, `Company Administrator`) or elevate their `accountType` during registration or profile updates.
3. **PII Isolation**: Private user fields (`email`, `phone`, `mfaEnabled`, `devices`) reside in `/users/{uid}` and are readable only by the account owner or verified administrators.
4. **Immutable Audit Trail**: `/audit_logs/{logId}` entries cannot be updated or deleted by any client.
5. **Server Timestamp Integrity**: All `createdAt` and `updatedAt` timestamps on write must match `request.time`.
6. **Master Gate on Subcollections**: `/chats/{chatId}/messages/{msgId}` checks parent chat membership (`request.auth.uid in get(...).data.memberUids`) and enforces scope isolation.
7. **Order Ownership**: Customers can only create and read `/orders/{orderId}` where `customerUid == request.auth.uid`, and cannot arbitrarily alter order status after submission.

## The Dirty Dozen Adversarial Payloads
1. Customer trying to create `/users/{uid}` with `role: "Super Administrator"`. -> **Expected: PERMISSION_DENIED**
2. Customer trying to update own `/users/{uid}` changing `accountType: "employee"`. -> **Expected: PERMISSION_DENIED**
3. Unverified email trying to claim bootstrap admin privileges (`email_verified: false`). -> **Expected: PERMISSION_DENIED**
4. User A attempting to read User B's `/users/{userB}` PII document. -> **Expected: PERMISSION_DENIED**
5. Customer querying `/directory_profiles` for `accountType == 'employee'`. -> **Expected: PERMISSION_DENIED**
6. Customer creating or reading an `employee_group` chat in `/chats/{chatId}`. -> **Expected: PERMISSION_DENIED**
7. Non-member posting a message into `/chats/{chatId}/messages/{msgId}`. -> **Expected: PERMISSION_DENIED**
8. Sender spoofing `senderUid` as another user when creating a chat message. -> **Expected: PERMISSION_DENIED**
9. Customer creating a `/products/{productId}` document. -> **Expected: PERMISSION_DENIED**
10. Customer setting `status: "delivered"` when creating an order in `/orders/{orderId}`. -> **Expected: PERMISSION_DENIED**
11. User injecting a 2KB string into document ID (`{meetingId}`) or shadow field `isVerified: true`. -> **Expected: PERMISSION_DENIED**
12. Any user attempting to `update` or `delete` `/audit_logs/{logId}`. -> **Expected: PERMISSION_DENIED**

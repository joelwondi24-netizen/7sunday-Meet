/**
 * Security Rules Verification Suite (Dirty Dozen Adversarial Cases)
 * Documents expected PERMISSION_DENIED assertions against firestore.rules.
 */

export const DIRTY_DOZEN_TEST_CASES = [
  { id: 1, name: 'Privilege escalation on signup (role: Super Administrator)', collection: '/users/{uid}', expected: 'PERMISSION_DENIED' },
  { id: 2, name: 'Account type switch by customer (accountType: employee)', collection: '/users/{uid}', expected: 'PERMISSION_DENIED' },
  { id: 3, name: 'Unverified email bootstrap admin spoof', collection: '/admins/{uid}', expected: 'PERMISSION_DENIED' },
  { id: 4, name: 'Cross-user PII read on /users/{otherUid}', collection: '/users/{otherUid}', expected: 'PERMISSION_DENIED' },
  { id: 5, name: 'Customer listing internal employee directory profiles', collection: '/directory_profiles', expected: 'PERMISSION_DENIED' },
  { id: 6, name: 'Customer accessing employee_group or employee_dm chat', collection: '/chats/{chatId}', expected: 'PERMISSION_DENIED' },
  { id: 7, name: 'Non-member message injection into chat', collection: '/chats/{chatId}/messages/{msgId}', expected: 'PERMISSION_DENIED' },
  { id: 8, name: 'Spoofed senderUid in chat message', collection: '/chats/{chatId}/messages/{msgId}', expected: 'PERMISSION_DENIED' },
  { id: 9, name: 'Customer creating or editing product catalog', collection: '/products/{productId}', expected: 'PERMISSION_DENIED' },
  { id: 10, name: 'Customer creating order with pre-delivered status', collection: '/orders/{orderId}', expected: 'PERMISSION_DENIED' },
  { id: 11, name: 'Shadow field (isVerified: true) or oversized ID poisoning', collection: '/meetings/{meetingId}', expected: 'PERMISSION_DENIED' },
  { id: 12, name: 'Mutation or deletion of immutable audit logs', collection: '/audit_logs/{logId}', expected: 'PERMISSION_DENIED' },
  { id: 13, name: 'Customer accessing internal transcript or spoofing speakerUid', collection: '/meeting_transcripts/{entryId}', expected: 'PERMISSION_DENIED' },
];

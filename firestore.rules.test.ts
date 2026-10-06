// Firestore Security Rules Test Specification (Dirty Dozen Verification)
export const dirtyDozenTests = [
  { name: '1. Shadow Field Injection on Order Create', expect: 'PERMISSION_DENIED' },
  { name: '2. Price Tampering Attack', expect: 'PERMISSION_DENIED' },
  { name: '3. Order Number Spoofing / Path Poisoning', expect: 'PERMISSION_DENIED' },
  { name: '4. Status Shortcutting on Create', expect: 'PERMISSION_DENIED' },
  { name: '5. Unauthorized Screenshot Read', expect: 'PERMISSION_DENIED' },
  { name: '6. Customer Order Enumeration (list)', expect: 'PERMISSION_DENIED' },
  { name: '7. Unverified Admin Email Spoof', expect: 'PERMISSION_DENIED' },
  { name: '8. Orphaned Order Without Tracking', expect: 'PERMISSION_DENIED' },
  { name: '9. Oversized Screenshot Payload', expect: 'PERMISSION_DENIED' },
  { name: '10. Invalid Game ID Format', expect: 'PERMISSION_DENIED' },
  { name: '11. Unauthorized Product Price Edit', expect: 'PERMISSION_DENIED' },
  { name: '12. Self-Assigned Admin Role', expect: 'PERMISSION_DENIED' },
];

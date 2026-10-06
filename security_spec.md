# KAWAIDONATE Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **No Public Order Listing or PII/Screenshot Leakage**: Full orders in `/orders/{orderId}` (which contain `payment_screenshot_url` and `reference_price`) can ONLY be read (`get`, `list`), updated, or deleted by verified Administrators (`isAdmin()`). Customers can NEVER read `/orders/{orderId}` or list `/order_tracking`.
2. **Exact-ID Order Tracking Only**: Customers can check order status via `/order_tracking/{orderId}` ONLY using `get` with a valid order number (`^KD-[0-9]{8}-[0-9]{4}$`). `list` on `/order_tracking` is strictly forbidden (`allow list: if false;`) to prevent enumerating other customers' orders.
3. **Server/Database Pricing Integrity**: When a customer creates an order in `/orders/{orderId}` and `/order_tracking/{orderId}`, the security rules enforce that:
   - `product_id` exists in `/products/$(incoming().product_id)` and `active == true`.
   - `diamond_amount`, `reference_price`, and `selling_price` strictly match the authoritative document in `/products/$(incoming().product_id)` and `selling_price == reference_price - 1`.
   - The sibling document in `/order_tracking/$(orderId)` is created atomically in the same batch (`existsAfter`) with matching fields.
4. **Immutable Order Core & Terminal State Locking**: Once an order reaches a terminal state (`Bajarildi` or `Bekor qilindi`), non-admins cannot update it, and only `isAdmin()` can update order status or operator fields.
5. **Admin Privilege Protection**: Only verified administrator (`fflashapps@gmail.com` with `email_verified == true` or existing `/admin_users/$(request.auth.uid)`) can modify `/products`, `/payment_settings`, `/telegram_operators`, or `/orders`.

## 2. The "Dirty Dozen" Payloads
1. **Shadow Field Injection on Order Create**: Injecting `"isVerified": true` into `/orders/KD-20261006-1234` -> Rejected by `hasOnly()`.
2. **Price Tampering Attack**: Customer submits `selling_price: 1` for 5600 Almaz -> Rejected because `incoming().selling_price` must equal `get(/databases/$(database)/documents/products/$(incoming().product_id)).data.selling_price`.
3. **Order Number Spoofing / Path Poisoning**: Creating `/orders/malicious_id_123` -> Rejected by `isValidOrderId(orderId)` regex `^KD-[0-9]{8}-[0-9]{4}$`.
4. **Status Shortcutting on Create**: Customer creates an order with `status: "Bajarildi"` -> Rejected because initial status on create must be `"To'lov tekshirilmoqda"` or `"Yangi"`.
5. **Unauthorized Screenshot Read**: Anonymous or normal signed-in user calls `get` on `/orders/KD-20261006-1234` -> Rejected because `allow read: if isAdmin()`.
6. **Customer Order Enumeration (`list`)**: Attacker calls `list` on `/order_tracking` -> Rejected because `allow list: if isAdmin()`.
7. **Unverified Admin Email Spoof**: Attacker signs in with unverified `fflashapps@gmail.com` (`email_verified == false`) and updates `/payment_settings/default` -> Rejected by `request.auth.token.email_verified == true`.
8. **Orphaned Order Without Tracking**: Customer writes to `/orders/KD-20261006-1234` without writing `/order_tracking/KD-20261006-1234` -> Rejected by `existsAfter()` atomicity invariant.
9. **Oversized Screenshot Payload (Denial of Wallet)**: Customer uploads a 2MB string to `payment_screenshot_url` -> Rejected by `.size() <= 900000`.
10. **Invalid Game ID Format**: Customer submits `game_id: "abc_hack"` -> Rejected by `incoming().game_id.matches('^[0-9]{5,16}$')`.
11. **Unauthorized Product Price Edit**: Non-admin user attempts `update` on `/products/ff_100` -> Rejected by `isAdmin()`.
12. **Self-Assigned Admin Role**: Regular user attempts `create` on `/admin_users/attacker_uid` -> Rejected by `isAdmin()`.

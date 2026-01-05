---
"three-bells": patch
---

Security improvements and vulnerability fixes

- Add authentication middleware to protect all POST routes
- Add authorization checks to RMP endpoints to prevent unauthorized access
- Escape user data in HTML to prevent XSS attacks (displayName, email, photo URLs)
- Add comprehensive input validation for dates, times, UUIDs, and numbers
- Implement CSRF protection with token validation on all forms
- Add error handling with try-catch blocks to all routes
- Validate query parameters to prevent injection attacks

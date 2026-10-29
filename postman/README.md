# Postman: User Accounts

Import `Manager-User-Accounts.postman_collection.json` into Postman. The collection defaults to `http://localhost:3000`; change its `baseUrl` variable if the API uses another address.

## Start here

1. Set `newUsername` and `newPassword` to values for a test account. Usernames are 3-32 characters and unique regardless of letter case; the password must be at least 8 characters.
2. Send **Public Auth → Create account**. The response script stores the new account ID and copies its credentials to the login variables. Self-registered accounts start as `viewer` with 0 credits.
3. Send **Public Auth → Login**. The response script stores the bearer token for the remaining requests.
4. Use **My Account** to view or update the username and profile, then change the password.

For **Admin - Users**, log in with an administrator account instead. Set `loginUsername` and `loginPassword`, send Login, then list users, get one user's safe detail data, block/unblock an account, change a username, or set its password. The admin API rejects non-admin tokens. Blocking an account revokes access on its next API request.

The collection covers account management endpoints only. It does not include payment or card-check requests.

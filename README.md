# filevine-to-ringcentral-node

Netlify function replacement for the archived Python `filevine-to-ringcentral` Cloud Function.

## Function

- `netlify/functions/sync-ringcentral.js`
- Scheduled with `@daily` in UTC on published deploys

## What It Does

- Authenticates to RingCentral with JWT credentials.
- Loads extensions and existing ELM answering rules.
- Pulls Filevine projects + client phones.
- Applies exclusion list and primary-name mapping.
- Removes archived case numbers and merges active numbers into answering rules.

## Environment Variables

See `.env.example`.

Required:

- `RC_APP_CLIENT_ID`
- `RC_APP_CLIENT_SECRET`
- `RC_USER_JWT`
- `FILEVINE_ORG_ID`
- `FILEVINE_USER_ID`
- `FILEVINE_CLIENT_ID`
- `FILEVINE_CLIENT_SECRET`
- `FILEVINE_PAT_TOKEN`

## Validate

```bash
npm run lint
```

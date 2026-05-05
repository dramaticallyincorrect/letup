# idea

a marketplace for user created app

## second pass

1. tests for backend
2. show drafts in app list
3. submit updates to marketplace
4. fetch_url tool
5. request_ai_access

## infra

1. signing
   1. sign in
   2. sign up
2. payment
3. add credit payment


# security consideration

1. not allowing ai to access destructive actions even if it calls the endpoint
   1. resource ids be uuid and always wrapped in closure that runs the mutation to not have the ai need the id.
   2. example: have a secret return to the client upon authentication, keep in memory, attach to request headers that are initiated by the user
2. http only authentication
3. custom renderers should not access to change the url
   1. CSP headers - search what we need
      1. form-action 'self'
      2. Maps-to 'self'
   2. inside ifram
   3. have the renderer code be served from another domain?
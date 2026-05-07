# idea

a marketplace for user created app

## second pass

1. ~~app builder with file access and install npm modules~~
2. optimize the new phase build system
3. updates to the app with database change
4. delete draft
5. install created apps from dashboard
6. submit updates to marketplace
7. request_ai_access
8. marketplace
   1. show grid of apps
   2. search apps
   3. capture screen shot from the app programaticcly
9.  official apps

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
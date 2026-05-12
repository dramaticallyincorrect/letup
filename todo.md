# idea

a marketplace for user created app

## v1


1. ~~app builder with file access and install npm modules~~
2. change title in long conversation lags
3. go through the core workflows and review the code
   1. no apps
   2. create app
   3. submit to market place
4. user database setup in production
5. github to store versions
6. plan when and how should apps be deleted, complete removal or always only marked as deleted
7. marketplace submissions should be against a immutable app_version snapshot
8. optimize the new phase build system
9. delete draft
10. install created apps from dashboard
11. submit updates to marketplace
12. marketplace
   1. show grid of apps
   2. search apps
   3. capture screen shot from the app programaticcly
13. official apps

## check

1. fix hot reload killing server logs
2. separate user conversation history from messaging context history
3. drop thinking from hisotry
4. create app flow

## out of scope

1. updates to the app with database change when submiting to marketplace
2. share app data or component code with other apps
3. canvas that can host multiple self contained components
4. shared (between users) database
5. open apps side by side

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
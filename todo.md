# idea

a marketplace for user created app

## v1


1. change title in long conversation lags
2. submissions called multiple times
3. ~~accounts~~
   1. ~~free 15 credit one time only~~
4. rename marketplace to app store
5. terms of services
6. privacy policy
7. analytics
8.  ~~landing page~~
9.  optimize the new phase build system
10. go through the core workflows and review the code
   1. no apps
   2. create app
   3. submit to market place
11. share console logs with ai
   1. in ai builder, listen for errors. if error is captured show a hint to the user, tell them if the app has issues they can share the captured error with the ai

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
6. install created apps from dashboard
11. submit updates to marketplace
12. github to store versions
10. plan when and how should apps be deleted, complete removal or always only marked as deleted
11. official apps
12. credit
    1. credit top up



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
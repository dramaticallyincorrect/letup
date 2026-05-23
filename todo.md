# idea

a marketplace for user created app

## v1


3. logo
4. separate message history from conversation view
5. points of optimization
   1. store files in github instead of database
   2. save ai usage logs to analytics instead of postgres?
6. backup setup
   1. postgres
   2. litestream
7. google sign in prod access
   1. check and verify logo , https://console.cloud.google.com/auth/branding?project=letup1
8.  analytics
    1. app opened
       1. app id
       2. creator or not
9.  add screen shot of my apps to landing page
10. make sure data is backed up by hetzner
11. go through the core workflows and review the code
   1. no apps
   2. create app
   3. submit to market place

## check

1. fix hot reload killing server logs
2. separate user conversation history from messaging context history
3. drop thinking from hisotry
4. create app flow

## out of scope

1. updates to the app with database change when submiting to marketplace
2. ultimate plan
   1. proxy for circumventing cors
3. plan when and how should apps be deleted, complete removal or always only marked as deleted
4. share app data or component code with other apps
5. canvas that can host multiple self contained components
   1. the main page be a editable canvas itself, with default apps like header
6. shared (between users) database
7. open apps side by side
8. install created apps from dashboard
9.  submit updates to marketplace
10. github to store versions
11. official apps
    1.  builder
    2.  include border and shadow in default styles.css
    3.  give build tool
    4.  try Todo tool
    5.  try having db and ai module out of prompt and on demand
    6.  https://gemini.google.com/app/f49e77135be7c241
    7.  back to ask questions to clarify
    8.  try one with plan + thinking and one without
    9.  research context optimizations
12. credit
    1. credit top up
 13. users choose the colors
     1.  use across apps option
 14. collapse conversation, only show the model text output
 15. play a small sound when build is done
 16. empty view for my apps



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
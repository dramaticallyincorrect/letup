# idea

a marketplace for user created app

## v1


3. logo
4. google sign in prod access
   1. check and verify logo , https://console.cloud.google.com/auth/branding?project=letup1
9.  analytics
    1. app opened
       1. app id
       2. creator or not
11. add screen shot of my apps to landing page
12. make sure data is backed up by hetzner
13. go through the core workflows and review the code
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
2. plan when and how should apps be deleted, complete removal or always only marked as deleted
3. share app data or component code with other apps
4. canvas that can host multiple self contained components
   1. the main page be a editable canvas itself, with default apps like header
5. shared (between users) database
6. open apps side by side
7. install created apps from dashboard
8.  submit updates to marketplace
9.  github to store versions
10. official apps
    10. builder
    1.  include border and shadow in default styles.css
    2.  give build tool
    3.  try Todo tool
    4.  try having db and ai module out of prompt and on demand
    5.  https://gemini.google.com/app/f49e77135be7c241
    6.  back to ask questions to clarify
    7.  try one with plan + thinking and one without
    8.  research context optimizations
11. credit
    1. credit top up
 12. users choose the colors
     1.  use across apps option
 13. collapse conversation, only show the model text output
 14. play a small sound when build is done
 15. empty view for my apps



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
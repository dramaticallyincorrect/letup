# idea

a marketplace for user created app

## v1


3. logo
4. upgrade from create page should open in new tab
5. ~~deploying when a build is in progress should not kill the running container~~
6. errors like anthropic running out of credits don't persist the progress
7. return db query errors to frontend to share with agent
8. skill?
   1. db
9.  migrations
10. google sign in prod access
   1. check and verify logo , https://console.cloud.google.com/auth/branding?project=letup1
11. analytics
    1. app opened
       1. app id
       2. creator or not
12. add screen shot of my apps to landing page
    1.  a shader
    2.  inkwel
13. make sure data is backed up by hetzner
14. go through the core workflows and review the code
   1. no apps
   2. create app
   3. submit to market place

## v2

1. context optimization
   1. compact conversation history
   2. memory?

## out of scope

1. updates to the app with database change when submiting to marketplace
2. points of optimization
   1. store files in github instead of database
   2. save ai usage logs to analytics instead of postgres?
3. ultimate plan
   1. proxy for circumventing cors
4. plan when and how should apps be deleted, complete removal or always only marked as deleted
5. share app data or component code with other apps
6. canvas that can host multiple self contained components
   1. the main page be a editable canvas itself, with default apps like header
7. shared (between users) database
8. open apps side by side
9. install created apps from dashboard
10. submit updates to marketplace
11. github to store versions
12. official apps
    1.  builder
    2.  include border and shadow in default styles.css
    3.  give build tool
    4.  try Todo tool
    5.  try having db and ai module out of prompt and on demand
    6.  https://gemini.google.com/app/f49e77135be7c241
    7.  back to ask questions to clarify
    8.  try one with plan + thinking and one without
    9.  research context optimizations
13. credit
    1. credit top up
 14. users choose the colors
     1.  use across apps option
 15. collapse conversation, only show the model text output
 16. play a small sound when build is done
 17. empty view for my apps



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
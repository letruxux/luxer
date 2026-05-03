# Luxer

Linear for Fluxer

## Commands

| Command   | Description                                                                                      | Usage                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `login`   | Login to Linear                                                                                  | l!login                                                                                                                         |
| `logout`  | Logout from Linear                                                                               | l!logout                                                                                                                        |
| `user`    | Get user info                                                                                    | l!user [@mention]                                                                                                               |
| `setup`   | Setup Linear (a community admin has to do this only once, locks a team for the entire community) | l!setup                                                                                                                         |
| `reset`   | Reset this community (undoes setup)                                                              | l!reset                                                                                                                         |
| `team`    | Show team info, states and labels                                                                | l!team                                                                                                                          |
| `new`     | Create a new issue                                                                               | l!new --title &lt;title&gt; [--labels &lt;labels&gt;] [--state &lt;state&gt;] [--description &lt;desc&gt;] [--due &lt;date&gt;] |
| `issues`  | Find or list issues                                                                              | l!issues [&lt;query \| issue-id&gt;]                                                                                            |
| `label`   | Manage issue labels                                                                              | l!label [--id &lt;id&gt;] &lt;add \| remove \| overwrite \| list&gt; [&lt;labels&gt;]                                           |
| `state`   | Set issue state                                                                                  | l!state [--id &lt;id&gt;] &lt;state&gt;                                                                                         |
| `due`     | Set due date                                                                                     | l!due [--id &lt;id&gt;] &lt;date&gt;                                                                                            |
| `comment` | Comment (or view) an issue                                                                       | l!comment [--id &lt;id&gt;] &lt;comment&gt;                                                                                     |
| `manage`  | Manage team labels and states                                                                    | l!manage &lt;labels \| states&gt;                                                                                               |
|           |                                                                                                  | All the `--id`/`-i` flags aren't required if replying to an issue embed.                                                        |
|           |                                                                                                  | &lt;required&gt; [optional]                                                                                                     |

## Setup

Docker image: `ghcr.io/letruxux/luxer:latest`

### Environment variables

- `FLUXER_TOKEN`: Bot token - REQUIRED!
- `LINEAR_CLIENT_ID`: Linear client ID - REQUIRED!
- `LINEAR_CLIENT_SECRET`: Linear client secret - REQUIRED!
- `LINEAR_REDIRECT_URI`: Linear redirect URI, you need to set this to `https://<domain>/callback` - REQUIRED!
- `DATABASE_FILENAME`: Optional - default: `linear.sqlite`
- `PORT`: Optional - default: `8288`

### Fluxer bot setup

Go to [https://linear.app/settings/api/applications/new](https://linear.app/settings/api/applications/new) and create a new application.

Input any name, then under "Bot token", click "Regenerate", then copy the token.

Paste the token as environment variable `FLUXER_TOKEN`.

#### Invite the bot

In the same bot page in the developers settings, scroll to "OAuth2 URL Builder", select `bot` as scope, give "Administrator" permissions (or the specific permissions you want) and click the copy button next to the Authorize URL.

### Fluxer app setup

Open the Fluxer desktop app (or web app) and go to Settings, scroll all the way down to "Developers" > "Applcations" and click "Create Application".

The only fields that matter are Callback URLs, they have to be the same as the `LINEAR_REDIRECT_URI` env variable.

Enable `Public` and `Client credentials`.

Then, copy the Client ID and Client Secret. You'll need to set them as the environment variables `LINEAR_CLIENT_ID` and `LINEAR_CLIENT_SECRET`.

### Example setup with Docker

```yaml
# compose.yaml

services:
  luxer:
    image: ghcr.io/letruxux/luxer:latest
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - 8288:8288
    volumes:
      - linear-data:/data

volumes:
  linear-data:
```

```bash
# .env

FLUXER_TOKEN=0000000000000000000.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx # change this!
DATABASE_FILENAME=/data/linear.sqlite
PORT=8288

LINEAR_CLIENT_ID=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa # change this!
LINEAR_CLIENT_SECRET=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa # change this!
LINEAR_REDIRECT_URI=https://luxer.example.com/callback # change this!
```

## Notes

- User tokens are stored in plain text in the database.
- Make sure to insert the database file in a volume to make sure it doesn't reset.
- You need to open port 8288 to the internet, users will use it to login.

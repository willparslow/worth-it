# Worth It: setup guide

About 20 minutes, all free, done once. It's the same recipe as Scrubber Duckies.

The app comes in two parts:
- **The app itself**: these files, hosted on GitHub Pages.
- **Everyone's data**: stored in Firebase (Google). Each person has their own private space. It keeps a copy on the phone, so it works with no signal, and syncs when signal comes back.

Until step 2 is done the app runs in **demo mode**: everything works, but it only saves on one phone. To try it, open the app with `?demo` on the end of the address. Add `?demo&sample` to see it filled with made-up sessions.

---

## 1. Create the Firebase project (about 8 min)

1. Go to <https://console.firebase.google.com> and sign in with your Google account.
2. **Create a project.** Call it `worth-it`. You can switch off Google Analytics.
   Use a new project, not the Scrubber Duckies one: its database rules would be replaced by these.
3. **Turn on Google sign-in:** go to *Build → Authentication → Get started → Sign-in method*. Choose **Google**, switch it on, pick your support email and click **Save**. Nothing else is needed (no email/password).
4. **Create the database:** go to *Build → Firestore Database → Create database*.
   - Location: **europe-west2 (London)**.
   - Start in **production mode**.
5. **Lock it down:** in Firestore, open the **Rules** tab. Delete what's there and paste in the whole of `firestore.rules`. Replace `ADMIN_EMAIL` with your own Gmail address (all lower case, keep the quotes), then click **Publish**.
   Your address is what lets you start the very first space without an invite. Everyone else needs an invite link.

## 2. Get the app's Firebase config (about 2 min)

1. In Firebase, go to *Project settings* (the cog icon) → *Your apps*, and click the **</>** (Web) icon.
2. Name it `worth-it`. You **don't** need Firebase Hosting, so leave that unticked.
3. Firebase shows a `firebaseConfig = { ... }` block. Copy it into `firebase-config.js`, in place of `null`:

```js
export const firebaseConfig = {
  apiKey: "…",
  authDomain: "…",
  projectId: "…",
  storageBucket: "…",
  messagingSenderId: "…",
  appId: "…"
};
```

These values are safe to put on a public website. What keeps everyone's data private is the rules from step 1.5.
(Or just send the block to Claude and it'll put it in for you.)

## 3. Put it on GitHub Pages (about 5 min)

1. Make sure the files are on the repo's **main** branch (merge the pull request, or ask Claude to).
2. On GitHub, go to the `worth-it` repo → *Settings → Pages*. Under *Source*, choose **Deploy from a branch**, pick **main** and **/ (root)**, then click **Save**.
   (Pages on a private repo needs a paid GitHub plan, so the repo needs to be public, as Scrubber Duckies is.)
3. After about a minute the app will be at `https://willparslow.github.io/worth-it/`.
4. Back in Firebase, go to *Authentication → Settings → Authorised domains*, click **Add domain** and add `willparslow.github.io`.

## 4. Set up each phone (about 2 min each)

1. **You first.** Open the link on your phone **while you have signal**, tap **Continue with Google** and pick the Gmail address you put in the rules. Fill in what you pay and your weekly goal.
2. **Inviting Tessa (and anyone else):** go to **Me → Share an invite link** and send it to them. Each link works once. When they open it they sign in with Google, tap **Join Worth It** and get their own private space. Nobody can see anyone else's sessions.
   Anyone using the app can invite people the same way. They can also type the code from the message on the "You need an invite" screen.
3. **Add it to the home screen:**
   - **iPhone (Safari):** tap Share → *Add to Home Screen*.
   - **Android (Chrome):** tap ⋮ → *Install app* (or *Add to Home screen*).
4. Open it once from the home-screen icon. From then on it opens and works with no signal.

---

## How it works

- **Home:** what each session has cost this month (monthly price ÷ sessions so far) and how much the next one will knock off. You also see this week against your weekly goal and this month against its goal and pace. Tap **I went! Tick it off**, pick what you trained, and enjoy the celebration.
- **Ticking off:** pick Arms, Legs, Core, Full body or any workout you've added. Tap more than one for a multiple session. Choose today, yesterday or any earlier day.
- **Plan:** suggests what to train next (whatever has waited longest; Full body counts for arms, legs and core). It shows a calendar coloured by workout, this month's mix, and every session. Tap a session to remove it. Use the arrows to look back at earlier months.
- **Me:** change what you pay (it applies from this month, so past months keep their old price), your weekly goal, an optional day-pass price (the "worth it" line) and the currency. Add, rename, recolour or remove workouts. You can also invite people, turn sounds off, download a backup or sign out.

### The praise
Every session gets confetti, a cheer and a fresh line of praise. It gets bigger for:
- the first session of the month
- hitting the weekly goal (and weeks in a row)
- bonus sessions over the goal
- the day each session becomes cheaper than a day pass
- all-time milestones (10, 25, 50, 100… sessions)

### No signal?
Everything still works and is saved on the phone. The badge at the top shows **Offline · saved on phone**, and **Synced ✓** once it has caught up. Making an invite, or joining with one, needs signal.

### Updating the app later
If the app files change, upload them to GitHub and change `VERSION` at the top of `sw.js` (e.g. `worth-it-v1` → `worth-it-v2`). Phones pick up the new version the next time the app is opened with signal, and show an **Update ready** banner.

# Personal Shift & Payroll App

One set of files, two ways to run it:

- **Android app (APK)**: built in the cloud by GitHub, no Android Studio needed. Section 1.
- **Installable web app (PWA)**: opens from a link and installs from Chrome. Section 5.

Both keep all data on the phone and work without internet.

## What is in this folder

| Path | What it does |
| --- | --- |
| `index.html`, `app.js`, `app.css` | The app itself. |
| `fonts/`, `icons/` | Inter font and app icons, bundled so nothing loads from outside. |
| `manifest.webmanifest`, `sw.js` | Web-app install and offline support (browser version only). |
| `capacitor.config.json`, `package.json`, `scripts/` | Turn the app into an Android project. |
| `assets/` | Source pictures for the Android icon and splash screen. |
| `.github/workflows/android-apk.yml` | Tells GitHub how to build the APK. |
| `signing/debug.keystore` | Fixed signing key (see section 3). |
| `src/input.css`, `tailwind.config.js` | Only needed if you change the design (section 6). |

## 1. Build the Android APK (about 15 minutes the first time)

The upload needs a computer, or a helper who can push the files to your repository for you. After that, everything is done from the phone.

1. Make a free account at github.com and create a **new repository** (name it anything, for example `shift-pay`).
2. Get all files into the repository, including the `.github`, `signing`, `assets`, `scripts`, `fonts` and `icons` folders. On a computer: unzip this folder, then **Add file > Upload files** and drag everything in. On a Mac press Cmd+Shift+. in Finder first so the hidden `.github` folder shows.
   - If the **Actions** tab later shows no "Build Android APK", add the workflow by hand: **Add file > Create new file**, type the name `.github/workflows/android-apk.yml`, paste the contents of that file and commit.
3. Open the **Actions** tab. The build starts by itself after the upload. If it does not, pick **Build Android APK** on the left and press **Run workflow**.
4. Wait about 8 to 12 minutes for a green tick.
5. On the repository's main page tap **Releases** (right side, or scroll down on a phone). Open the newest one and tap **shift-pay.apk**. It downloads straight to the phone.
6. Open the downloaded file. Allow "Install unknown apps" for Chrome when asked. If Play Protect warns that the app is not from the Play Store, choose **Install anyway**.

If the run shows a red cross, open it, copy the red error lines and send them to me. I have not been able to run this build on GitHub's servers from here, so a first-run problem is possible.

## 2. Move your data into the Android app

The browser version and the Android app keep their data separately.

1. In the old version tap **Download Backup**.
2. In the Android app tap **Restore Backup** and pick that file.

Inside the Android app, **Download Backup** opens the phone's share sheet. Save the file to Drive or Files, or send it to yourself on WhatsApp.

## 3. Updating the app later

Change the files, upload them to the repository and download the new APK from the next run. The same signing key is used every time (the build checks this and stops if it is not), so the new APK installs over the old one and keeps all data. Build results are kept for 30 days; press **Run workflow** again any time to make a fresh one.

`signing/debug.keystore` is a standard debug key, and anyone who can see your repository can see it. That is fine for an app you install yourself. If you want nobody to be able to produce an APK that updates your app, make the repository private. Before publishing on the Play Store, use a separate private release key instead (ask me to set that up).

## 4. Build on your own computer instead

You need Node 22, JDK 21 and Android Studio Otter (2025.2.1) or newer.

```
npm install
npm run android:init     # makes the android/ project, icons and splash screen
npm run android:open     # opens Android Studio: Build > Build APK(s)
```

After changing the web files run `npm run android:sync`.

## 5. Installable web app (PWA)

Put the files on any https host, for example GitHub Pages (repository Settings > Pages > Deploy from branch > `main` / root) or https://app.netlify.com/drop. Open the link in Android Chrome and tap **Install app**.

To test on a computer: `python3 -m http.server 8000`, then open http://localhost:8000.

## 6. Changing the app

- Edit `index.html` or `app.js`.
- After adding or changing Tailwind classes rebuild the CSS: `npx tailwindcss@3.4.17 -c tailwind.config.js -i src/input.css -o app.css --minify`
- For the web version, change `CACHE_VERSION` in `sw.js` (for example `v2` to `v3`) so phones fetch the new files. Saved data is never touched by updates.

## Before publishing on the Play Store

- The app id in `capacitor.config.json` is `com.gulubro999.shiftpay`. Change it to the one you want to keep before publishing, because it cannot be changed after publishing.
- Use a private release key and build an AAB instead of the debug APK.

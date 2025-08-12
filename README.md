<div align="center"><img src="static/logo.png" height=75 alt="Midah Soundboard, VB-Cable Soundboard, Audio Soundboard, Virtual Audio Device, Sound Effects"/></div>
<h1 align="center">Midah</h1>
<h6 align="center">simple vb-cable soundboard with every sound imaginable</h6>
<div align="center">
  <a href="https://github.com/akramboussanni/midah/releases/latest" target="_blank">
    <img src="https://img.shields.io/badge/Download-Latest%20Release-blue?style=for-the-badge&logo=github&logoColor=white" alt="Download Latest Release"/>
  </a>
</div>

<div align="center">
  <h3>  ^^^^^^^^ <b>press <a href="https://github.com/akramboussanni/midah/releases/latest">this</a> to download</b> ^^^^^^^^</h3>
</div>

### Core Features

- **Hotkey System**: Play or stop sounds without even opening the app.
- **Sound Categorization**: Order your sounds with categories so your app doesn't stay messy.
- **Playback volume**: Set an output device to hear your own audios. Control output, playback and individual audio volume.
- **Local-only**: Play audio locally only and don't output it to your mic
- **VB-Cable Installer**: Midah requires VB-Cable or any virtual cable to work. It provides an installer for VB-Cable in the case that it is not present.
- **YouTube Integration**: Search and import audio directly from YouTube videos using `yt-dlp` and `ffmpeg`, which are automatically installed.

### User Interface

<div align="center">
  <img src="static/main.png" alt="Midah Main Interface" width="600"/>
  <p><em>Clean and intuitive interface for easy sound management</em></p>
</div>

### YouTube Integration

<div align="center">
  <img src="static/yt.png" alt="YouTube Search Integration" width="600"/>
  <p><em>Search and import audio directly from YouTube videos</em></p>
</div>


---


### Requirements
Requires any sort of VB Audio implementation, yt-dlp and ffmpeg (autoinstalled.)

This app kind of works on Linux (WIP...), I mostly added support but I did not complete it, some things are currently Windows-only. I also don't know if there's a virtual cable for Linux. Never tested it. I will not supply builds until I test it properly

### Building/Contributing
idk why you would build this. the codebase is not really that good. i am not used to Rust

as for the Vue frontend i did not make it myself and did not review it very much. the project is built with Tauri, use that reference
1. download the rust language
2. download the node latest version
3. clone project and open it
4. run `npm install`
5. run `npm run tauri dev` to test, run `npm run tauri build` to build
   

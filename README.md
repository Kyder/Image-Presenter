# Image-Presenter
Fullscreen image presenter with web control and addons.

Application shows images in Fullscreen, and trought web browser is possible to control any part of this app. 
This is app running on Tauri framework. Originaly it was running at Electron but app was rebuild for Tauri, because it can run very fast, app can be really small and is running even on on less powerfull machines.

Basic functions:
- Image presentation with adjustable delay
- Screen rotation
- Image fit to screen, strech to screen or zoom and crop to screen
- Multidevice support (apply settings to one device or multiple)
- Media upload (JPG, PNG, SVG) and option to delete files
- Network setings where you can adjust ports or IP and name
- Addon support

Addons: CURENCTLY BEING REWORKED FOR TAURI

Date/Time Display>
Shows real Date and Time on the screen in few modes with option to use custom font or adjust font size.

Scheduled restart>
From start of the app, it starts counting for how long app is running and after set of hours, it will restart whole pc.
Can show warrning before restart will. Also offers basic customization for warrning.



Known issues:




Addons:

Date/Time Display:
- Teleporting is happening only from two corners
- Sliding from left to right is actually from right to left 

Scheduled restart:
- When you change settings multiple times warrning may stay on the screen even when you disable the addon, restart is required to keep everything working corectly after this happen

This app was made with help of AI, can have some security problems or some parts might not behave as wanted but generally speaking, if it works it works.
So I cannot guarantee how secure this application is.

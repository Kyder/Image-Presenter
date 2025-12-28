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


Currently it is missing autodiscovery function, update and maybe one network feature. Will be fixed in future versions.

Addons:

Date/Time Display>
Shows real Date and Time on the screen in few modes with option to use custom font or adjust font size.

Scheduled restart>
From start of the app, it starts counting for how long app is running and after set of hours, it will restart whole pc.
Can show warrning before restart will. Also offers basic customization for warrning.



Known issues:
- Animations of moving font can look stuttery on low end hw with linux without proper hw render support (Probably need some tinkering with drivers and WebKitGTK settings). On windows it will run smoothly even on lowend hw.



Addons:

Date/Time Display:
- Sliding from left to right is actually from right to left 


This app was made with help of AI, can have some security problems or some parts might not behave as wanted but generally speaking, if it works it works.
So I cannot guarantee how secure this application is.

Difference between versions:

Electron> Most Complete version, have working auto discovery function. Works well on windows and linux but dont run well on low end pc

Tauri> Works great on windows, even on low end pc. Works terible on linux.

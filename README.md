# Image-Presenter
Fullscreen image presenter with web control and addons.

Application shows images in Fullscreen, and trought web browser is possible to control any part of this app. 
This is Electron (node.js) app.

Basic functions:
- Image presentation with adjustable delay
- Screen rotation
- Multidevice support (apply settings to one device or multiple)
- Media upload (JPG, PNG, SVG) and option to delete files
- Network setings where you can adjust ports or IP and name
- Addon support

Addons:

Date/Time Display>
Shows real Date and Time on the screen in few modes with option to use custom font or adjust font size.

Scheduled restart>
From start of the app, it starts counting for how long app is running and after set of hours, it will restart whole pc.
Can show warrning before restart will. Also offers basic customization for warrning.



Known issues:

Main App: 
Video MP4 doesnt work even when listed as supported.

Web Control:
- In Network tab "localhost only mode" is not showing if it is on or not but actually works and changes state in the config.jsson
- In Addon tab, when you click on save button, it will reload the page and close settings for every addon
- In Display tab, screen rotations works but two of them can have wrong names

Addons:
Date/Time Display:
- Teleporting is happening only from two corners
- Sliding from left to right is actually from right to left 

Scheduled restart:
- When you change settings multiple times warrning may stay on the screen even when you disable the addon, restart is required to keep everything working corectly after this happen

This app was made with help of AI, can have some security problems or some parts might not behave as wanted but generally speaking, if it works it works.
So I cannot guarantee how secure this application is.

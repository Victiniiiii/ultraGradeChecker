# GradeChecker
## What is this project?
This is a personal project i created, because checking my grades were taking so long. This app makes every step automated, even saves the lessons in device so i can check them while i am offline, and sends notifications if any of the lessons data changes with all the information.

## Technologies used
Javascript and React for the base code,

Expo and React Native to make it a mobile app,

CSV and React Native Async Storage to store the data,

React Native Webview to simulate an automated browser,

Expo Notifications to send notifications if a lessons data changes
## How does it work?

Firstly you need to download the APK from the releases part. You can clone the repository and use expo build to use it for Apple devices.

When inside the app, you should enter your student number and password. This project is fully open source, so you can check the repository if you don't trust enough to put your password in.

When you press the main button, it will open a React Webview window in the next window. It will login, open the grades page, and extract the information as CSV incredibly quickly.

After a data is successfully extracted, it will be formatted for ease of use, and an app notification will be send, notifying you if any grade of yours has changed. It will also be saved in the grades tab.

Have a good day!

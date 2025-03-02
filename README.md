# `LiveInvoke`

This project is the result of an AI hackathon using various agents. It is an extension that allows debugging of powershell scripts without futzing about with the `launch.json`.

![image](https://github.com/user-attachments/assets/a148fd20-dbf1-47be-9164-097894e528ed)

## Requires

- The `powershell` vscode extension. Otherwise the debug profile that is created and launched by _this_ extension will fail.

## How to use

- Install the extension
- Open a powershell file in `vscode`
- Place breakpoints
- Click the play button over functions

## Todo

- [x] Simple parsing of function headers
- [x] Add a run button that identifies the function and calls other code with the necessary metadata
- [x] Dynamically create an update the `launch.json` for a workspace to add the necessary `invoke`.
- [x] Create the local file necessary to actually run your app
- [x] Able to debug simple functions with a single click
- [x] Move generated script file out of the local repository
- [ ] Support powershell modules
- [ ] Support importing a totally different file via comment (Support for `Language-Settings` by importing `common.ps1`)
- [ ] Publish github release
- [ ] Allow setting of arguments, triggerable by codelens UI
- [ ] Should the working directory be updated so that when we call launch.json profile it changes working dir to the one containing the script?
- [ ] Publish as actual extension
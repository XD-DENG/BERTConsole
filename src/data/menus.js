
module.exports = {
  
  // shell context menu

  ShellContext: [
    { label: 'Select All', id: 'shell-select-all', accelerator: "Ctrl+A" },
    { role: 'copy' },
    { role: 'paste' },
    { type: 'separator' },
    { label: 'Clear Shell', id: 'shell-clear-shell', accelerator: "Ctrl+F8" }
  ],

  // main menu (menu bar)

  Main: [
    {
      label: "File",
      submenu: [
        {
          id: "file-new",
          label: "New",
          accelerator: "CmdOrCtrl+N"
        },
        {
          id: "file-open",
          label: "Open...",
          accelerator: "CmdOrCtrl+O"
        },
        {
          id: "open-recent",
          submenu: [],
          label: "Open Recent"
        },
        {
          id: "file-save",
          label: "Save",
          accelerator: "CmdOrCtrl+S"
        },
        {
          id: "file-save-as",
          label: "Save As...",
          accelerator: "Ctrl+Shift+S"
        },
        {
          id: "file-revert",
          label: "Revert"
        },
        {
          id: "file-close",
          label: "Close Document",
          accelerator: "CmdOrCtrl+W"
        },
        {
          type: "separator"
        },
        {
          role: "quit",
          label: "Close BERT Console"
        }
      ]
    },
    {
      label: "Edit",
      submenu: [
        {
          role: "undo"
        },
        {
          role: "redo"
        },
        {
          type: "separator"
        },
        {
          role: "cut"
        },
        {
          role: "copy"
        },
        {
          role: "paste"
        },
        {
          role: "delete"
        },
        {
          role: "selectall"
        },
        {
          type: "separator"
        },
        {
          id: "find",
          label: "Find",
          accelerator: "Ctrl+F"
        },
        {
          id: "replace",
          label: "Replace",
          accelerator: "Ctrl+H"
        }
      ]
    },
    {
      label: "View",
      submenu: [
        {
          label: "Show Editor",
          type: "checkbox",
          setting: "editor.hide",
          invert: true,
          accelerator: "Ctrl+Shift+E"
        },
        {
          label: "Show R Shell",
          type: "checkbox",
          setting: "shell.hide",
          invert: true,
          accelerator: "Ctrl+Shift+R"
        },
        {
          label: "Layout",
          submenu: [
            {
              label: "Side by Side",
              type: "radio",
              setting: "layout.direction",
              value: "HORIZONTAL"
            },
            {
              label: "Top and Bottom",
              type: "radio",
              setting: "layout.direction",
              value: "VERTICAL"
            },
            "separator",
            {
              label: "Reset Layout",
              id: "reset-layout"
            }
          ]
        },
        {
          type: "separator"
        },
        {
          label: "Editor",
          submenu: [
            {
              id: "editor-theme",
              label: "Editor Theme"
            },
            /*
            {
              label: "Show Line Numbers",
              type: "checkbox",
              setting: "editor.CodeMirror.lineNumbers"
            },
            */
            {
              label: "Show Status Bar",
              type: "checkbox",
              setting: "editor.statusBar"
            }
          ]
        },
        {
          label: "Shell",
          submenu: [
            {
              id: "shell-theme",
              label: "Shell Theme"
            },
            {
              label: "Show Function Tips",
              type: "checkbox",
              setting: "shell.hide-function-tips",
              invert: true
            },
            {
              label: "Update Console Width on Resize",
              type: "checkbox",
              setting: "shell.resize"
            },
            {
              label: "Wrap Long Lines",
              type: "checkbox",
              setting: "shell.wrap"
            }
          ]
        },
        {
          id: "user-stylesheet",
          label: "User Stylesheet"
        },
        "separator",
        {
          label: "Developer",
          submenu: [
            {
              label: "Allow Reloading",
              type: "checkbox",
              setting: "developer.allow-reloading"
            },
            {
              id: "developer-reload",
              label: "Reload",
              accelerator: "CmdOrCtrl+R"
            },
            {
              label: "Toggle Developer Tools",
              accelerator: "Ctrl+Shift+I",
              id: "developer-toggle-tools"
            }
          ]
        }
      ]
    },
    {
      label: "Packages",
      submenu: [
        {
          id: "r-packages-choose-mirror",
          label: "Choose CRAN Mirror"
        },
        {
          id: "r-packages-install-packages",
          label: "Install Packages"
        }
      ]
    },
    {
      label: "Help",
      submenu: [
        {
          id: "help-learn-more",
          label: "Learn More"
        },
        {
          id: "help-feedback",
          label: "Feedback"
        },
        {
          id: "help-issues",
          label: "Issues"
        },
        {
          type: "separator"
        },
        {
          enabled: false,
          id: "bert-shell-version",
          label: "BERT Shell Version"
        }
      ]
    }
  ]

}
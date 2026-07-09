using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using Microsoft.Web.WebView2.Core;
using System.Collections.Generic;
using System.Windows.Threading;
using System.Linq;

namespace WorkPlace
{
    public partial class MainWindow : Window
    {
        private const int WH_KEYBOARD_LL = 13;
        private const int WM_KEYDOWN = 0x0100;
        private const int WM_SYSKEYDOWN = 0x0104;
        private const int VK_TAB = 0x09;
        private const int VK_ESCAPE = 0x1B;
        private const int VK_F4 = 0x73;
        private const int VK_LWIN = 0x5B;
        private const int VK_RWIN = 0x5C;
        private const int LLKHF_ALTDOWN = 0x20;

        [StructLayout(LayoutKind.Sequential)]
        private struct KBDLLHOOKSTRUCT
        {
            public int vkCode;
            public int scanCode;
            public int flags;
            public int time;
            public IntPtr dwExtraInfo;
        }

        private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);
        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);
        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool UnhookWindowsHookEx(IntPtr hhk);
        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr GetModuleHandle(string lpModuleName);

        [DllImport("user32.dll")]
        private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
        
        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        
        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int vKey);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool IsWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool IsIconic(IntPtr hWnd);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll", SetLastError = true)]
        static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);

        private const int HWND_BROADCAST = 0xffff;
        private const int WM_SETTINGCHANGE = 0x001A;
        private const int SMTO_ABORTIFHUNG = 0x0002;
        
        private const uint WM_CLOSE = 0x0010;

        private const int GWL_STYLE = -16;
        private const int WS_MAXIMIZEBOX = 0x00010000;
        
        [DllImport("user32.dll", SetLastError = true)]
        private static extern int GetWindowLong(IntPtr hWnd, int nIndex);

        [DllImport("user32.dll")]
        private static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

        private class AppWindow
        {
            public string Id { get; set; } = "";
            public IntPtr Hwnd { get; set; }
            public string State { get; set; } = "";
        }

        private static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
        private const uint SWP_SHOWWINDOW = 0x0040;
        private const int SW_RESTORE = 9;
        private const int VK_CONTROL = 0x11;
        private const int VK_SHIFT = 0x10;

        private LowLevelKeyboardProc _proc;
        private IntPtr _hookID = IntPtr.Zero;
        
        private Dictionary<string, IntPtr> _paneWindows = new Dictionary<string, IntPtr>();
        private List<AppWindow> _trackedApps = new List<AppWindow>();
        private DispatcherTimer _trackerTimer;
        private bool _isLocked = false;
        private bool _forceClose = false;
        private bool _isTesting = false;

        public MainWindow()
        {
            InitializeComponent();
            _proc = HookCallback;
            _hookID = SetHook(_proc);
            this.Closed += (s, e) => {
                UnhookWindowsHookEx(_hookID);
                RestoreTouchpadGestures();
            };
            AppDomain.CurrentDomain.ProcessExit += (s, e) => RestoreTouchpadGestures();
            this.Closing += MainWindow_Closing;
            this.Activated += MainWindow_Activated;
            this.Loaded += (s, e) => {
                this.WindowState = WindowState.Normal;
                this.WindowStyle = WindowStyle.None;
                this.WindowState = WindowState.Maximized;
                this.Activate();
                this.Focus();
                webView.Focus();
            };
            
            _trackerTimer = new DispatcherTimer();
            _trackerTimer.Interval = TimeSpan.FromMilliseconds(500);
            _trackerTimer.Tick += TrackerTimer_Tick;
            _trackerTimer.Start();

            DisableTouchpadGestures();
            InitializeAsync();
        }

        private void DisableTouchpadGestures()
        {
            try
            {
                using (var key = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\PrecisionTouchPad"))
                {
                    key.SetValue("ThreeFingerSlideEnabled", 0, Microsoft.Win32.RegistryValueKind.DWord);
                    key.SetValue("FourFingerSlideEnabled", 0, Microsoft.Win32.RegistryValueKind.DWord);
                }
                using (var key = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(@"Software\Policies\Microsoft\Windows\EdgeUI"))
                {
                    key.SetValue("AllowEdgeSwipe", 0, Microsoft.Win32.RegistryValueKind.DWord);
                }
                SendMessageTimeout((IntPtr)HWND_BROADCAST, WM_SETTINGCHANGE, UIntPtr.Zero, "Environment", SMTO_ABORTIFHUNG, 100, out _);
            }
            catch { }
        }

        private void RestoreTouchpadGestures()
        {
            try
            {
                using (var key = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\PrecisionTouchPad"))
                {
                    key.SetValue("ThreeFingerSlideEnabled", 1, Microsoft.Win32.RegistryValueKind.DWord);
                    key.SetValue("FourFingerSlideEnabled", 1, Microsoft.Win32.RegistryValueKind.DWord);
                }
                using (var key = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(@"Software\Policies\Microsoft\Windows\EdgeUI"))
                {
                    key.DeleteValue("AllowEdgeSwipe", false);
                }
                SendMessageTimeout((IntPtr)HWND_BROADCAST, WM_SETTINGCHANGE, UIntPtr.Zero, "Environment", SMTO_ABORTIFHUNG, 100, out _);
            }
            catch { }
        }

        private void MainWindow_Closing(object? sender, System.ComponentModel.CancelEventArgs e)
        {
            if (_isLocked && !_forceClose)
            {
                e.Cancel = true;
            }
        }

        private void TrackerTimer_Tick(object? sender, EventArgs e)
        {
            if (webView == null || webView.CoreWebView2 == null) return;
            var appsToNotify = new List<object>();

            foreach (var app in _trackedApps.ToArray())
            {
                if (app.State == "closed") continue;

                if (!IsWindow(app.Hwnd) || !IsWindowVisible(app.Hwnd))
                {
                    app.State = "closed";
                    appsToNotify.Add(new { type = "AppClosed", id = app.Id });
                    _trackedApps.Remove(app);
                }
                else if (IsIconic(app.Hwnd) && app.State != "minimized")
                {
                    app.State = "minimized";
                    appsToNotify.Add(new { type = "AppMinimized", id = app.Id });
                }
            }

            foreach (var notification in appsToNotify)
            {
                webView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(notification));
            }
        }

        private void MainWindow_Activated(object? sender, EventArgs e)
        {
            BringPanesToFront();
        }

        private void BringPanesToFront()
        {
            foreach (var hWnd in _paneWindows.Values)
            {
                if (hWnd != IntPtr.Zero)
                {
                    // SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE
                    SetWindowPos(hWnd, HWND_TOPMOST, 0, 0, 0, 0, 0x0002 | 0x0001 | 0x0010);
                }
            }
        }

        private IntPtr SetHook(LowLevelKeyboardProc proc)
        {
            using (Process curProcess = Process.GetCurrentProcess())
            using (ProcessModule curModule = curProcess.MainModule!)
            {
                return SetWindowsHookEx(WH_KEYBOARD_LL, proc, GetModuleHandle(curModule.ModuleName), 0);
            }
        }

        private static bool _winKeyHandled = false;
        
        [DllImport("user32.dll")]
        static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        private const int WM_KEYUP = 0x0101;
        private const int WM_SYSKEYUP = 0x0105;

        private IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0)
            {
                bool isKeyDown = (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN);
                bool isKeyUp = (wParam == (IntPtr)WM_KEYUP || wParam == (IntPtr)WM_SYSKEYUP);

                if (isKeyDown || isKeyUp)
                {
                    KBDLLHOOKSTRUCT kbStruct = Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(lParam);

                    if (kbStruct.vkCode == VK_LWIN || kbStruct.vkCode == VK_RWIN)
                    {
                        if (isKeyDown)
                        {
                            _winKeyHandled = false;
                        }
                        else if (isKeyUp)
                        {
                            if (!_winKeyHandled)
                            {
                                // Prevent Start Menu from opening by injecting a dummy keystroke
                                keybd_event(0xFF, 0, 0, UIntPtr.Zero);
                                keybd_event(0xFF, 0, 2, UIntPtr.Zero);
                            }
                        }
                    }
                    else if (isKeyDown)
                    {
                        _winKeyHandled = true;
                    }

                    if (isKeyDown)
                    {
                        bool alt = (kbStruct.flags & LLKHF_ALTDOWN) != 0;
                bool ctrl = (GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0;
                bool shift = (GetAsyncKeyState(VK_SHIFT) & 0x8000) != 0;

                // Ctrl + Shift + X to trigger Exit Modal
                if (ctrl && shift && kbStruct.vkCode == 0x58) 
                {
                    Application.Current.Dispatcher.InvokeAsync(() => {
                        this.Topmost = true;
                        this.Activate();
                        webView.CoreWebView2.ExecuteScriptAsync("document.getElementById('exitBtn').click();");
                    });
                    return (IntPtr)1;
                }
                
                // Ctrl + Shift + K to forcefully kill app when testing
                if (_isTesting && ctrl && shift && kbStruct.vkCode == 0x4B)
                {
                    Application.Current.Dispatcher.InvokeAsync(() => {
                        _forceClose = true;
                        Application.Current.Shutdown();
                    });
                    return (IntPtr)1;
                }
                
                bool win = (GetAsyncKeyState(VK_LWIN) & 0x8000) != 0 || (GetAsyncKeyState(VK_RWIN) & 0x8000) != 0;

                if (alt && kbStruct.vkCode == VK_TAB) return (IntPtr)1;
                if (alt && kbStruct.vkCode == VK_ESCAPE) return (IntPtr)1;
                if (alt && kbStruct.vkCode == VK_F4) return (IntPtr)1;
                if ((kbStruct.vkCode == VK_ESCAPE) && ctrl) return (IntPtr)1;
                
                // Block harmful Win key combinations, but allow Win+Shift+S and Win+V
                if (win && kbStruct.vkCode == VK_TAB) return (IntPtr)1; // Win+Tab
                if (win && kbStruct.vkCode == 0x44) return (IntPtr)1; // Win+D
                if (win && kbStruct.vkCode == 0x4D) return (IntPtr)1; // Win+M
                
                        // Block desktop switching (Ctrl+Win+Left/Right) which is triggered by 4-finger gestures
                        if (win && ctrl && kbStruct.vkCode == 0x25) return (IntPtr)1; // Ctrl+Win+Left
                        if (win && ctrl && kbStruct.vkCode == 0x27) return (IntPtr)1; // Ctrl+Win+Right
                        if (win && ctrl && kbStruct.vkCode == 0x73) return (IntPtr)1; // Ctrl+Win+F4 (Close Desktop)
                    }
                }
            }
            return CallNextHookEx(_hookID, nCode, wParam, lParam);
        }

        async void InitializeAsync()
        {
            await webView.EnsureCoreWebView2Async(null);
            
            EnsureConfigExists();

            try
            {
                var configPath = Path.Combine(Directory.GetCurrentDirectory(), "user-data", "config.json");
                if (File.Exists(configPath))
                {
                    var doc = JsonDocument.Parse(File.ReadAllText(configPath));
                    if (doc.RootElement.TryGetProperty("testing", out var testingProp))
                    {
                        _isTesting = testingProp.GetBoolean();
                    }
                }
            }
            catch { }

            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string htmlPath = Path.Combine(appDir, "wwwroot", "index.html");
            webView.CoreWebView2.Navigate(new Uri(htmlPath).AbsoluteUri);
            
            webView.CoreWebView2.WebMessageReceived += CoreWebView2_WebMessageReceived;
            
            webView.CoreWebView2.NavigationCompleted += (s, e) => {
                this.Activate();
                this.Focus();
                webView.Focus();
            };
        }

        private void EnsureConfigExists()
        {
            try
            {
                var baseDir = Directory.GetCurrentDirectory();
                var userDataDir = Path.Combine(baseDir, "user-data");
                Directory.CreateDirectory(userDataDir);
                
                var configPath = Path.Combine(userDataDir, "config.json");
                if (!File.Exists(configPath))
                {
                    var defaultConfig = @"{
  ""testing"": false,
  ""password"": ""changeme"",
  ""apps"": [
    { ""name"": ""Calculator"", ""id"": ""calc"", ""executable"": ""calc.exe"" },
    { ""name"": ""Notepad"", ""id"": ""notepad"", ""executable"": ""notepad.exe"" }
  ],
  ""websites"": [
    { ""name"": ""Example"", ""url"": ""https://example.com"" }
  ],
  ""allowedDomains"": [
    ""example.com"",
    ""localhost"",
    ""127.0.0.1"",
    ""0.0.0.0""
  ]
}";
                    File.WriteAllText(configPath, defaultConfig);
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine(ex.Message);
            }
        }

        private void CoreWebView2_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            try
            {
                var message = e.WebMessageAsJson;
                var data = JsonSerializer.Deserialize<JsonElement>(message);
                var type = data.GetProperty("type").GetString();

                if (type == "ExitApp")
                {
                    // Exit cleanly without killing launched apps
                    _forceClose = true;
                    Application.Current.Shutdown();
                }
                else if (type == "LoadConfig")
                {
                    var baseDir = Directory.GetCurrentDirectory();
                    var configPath = Path.Combine(baseDir, "user-data", "config.json");
                    var content = File.Exists(configPath) ? File.ReadAllText(configPath) : "{}";
                    var response = new { type = "ConfigLoaded", config = content };
                    webView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(response));
                }
                else if (type == "SetLock")
                {
                    _isLocked = data.GetProperty("locked").GetBoolean();
                }
                else if (type == "LaunchApp")
                {
                    var id = data.GetProperty("id").GetString();
                    var paneId = data.GetProperty("paneId").GetString();
                    var exe = data.GetProperty("executable").GetString();
                    var bounds = data.GetProperty("bounds");
                    var arguments = data.TryGetProperty("arguments", out var argProp) ? argProp.GetString() : null;
                    LaunchAndPositionApp(id!, paneId!, exe, bounds, arguments);
                }
                else if (type == "RestoreApp")
                {
                    var id = data.GetProperty("id").GetString();
                    var paneId = data.GetProperty("paneId").GetString();
                    var bounds = data.GetProperty("bounds");

                    var app = _trackedApps.Find(a => a.Id == id);
                    if (app != null && app.State == "minimized")
                    {
                        app.State = "open";
                        _paneWindows[paneId!] = app.Hwnd;
                        PositionWindow(app.Hwnd, bounds, true);
                    }
                }
                else if (type == "ForceRestore")
                {
                    var id = data.GetProperty("id").GetString();
                    var app = _trackedApps.Find(a => a.Id == id);
                    if (app != null)
                    {
                        app.State = "open";
                        ShowWindow(app.Hwnd, SW_RESTORE);
                        SetForegroundWindow(app.Hwnd);
                    }
                }
                else if (type == "CloseApp")
                {
                    var id = data.GetProperty("id").GetString();
                    var app = _trackedApps.Find(a => a.Id == id);
                    if (app != null)
                    {
                        SendMessage(app.Hwnd, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
                    }
                }
                else if (type == "UpdateBounds")
                {
                    var panes = data.GetProperty("panes");
                    foreach (var pane in panes.EnumerateArray())
                    {
                        var paneId = pane.GetProperty("id").GetString();
                        if (_paneWindows.TryGetValue(paneId!, out IntPtr hWnd) && hWnd != IntPtr.Zero)
                        {
                            PositionWindow(hWnd, pane.GetProperty("bounds"), false);
                        }
                    }
                }
                else if (type == "GenerateReport")
                {
                    var content = data.GetProperty("content").GetString();
                    if (!string.IsNullOrEmpty(content))
                    {
                        var baseDir = Directory.GetCurrentDirectory();
                        var dateDir = Path.Combine(baseDir, "user-data", "reports", DateTime.Now.ToString("yyyy-MM-dd"));
                        Directory.CreateDirectory(dateDir);
                        var path = Path.Combine(dateDir, "Report.csv");
                        if (!File.Exists(path))
                        {
                            File.WriteAllText(path, "Session ID,Start Time,Duration,Activities,Notes,Namjap" + Environment.NewLine);
                        }
                        File.AppendAllText(path, content + Environment.NewLine);
                    }
                }
                else if (type == "GetTrackerDates")
                {
                    var baseDir = Directory.GetCurrentDirectory();
                    var reportsDir = Path.Combine(baseDir, "user-data", "reports");
                    var dates = new List<string>();
                    if (Directory.Exists(reportsDir))
                    {
                        var dirs = Directory.GetDirectories(reportsDir);
                        foreach (var d in dirs)
                        {
                            dates.Add(new DirectoryInfo(d).Name);
                        }
                    }
                    var response = new { type = "TrackerDates", dates = dates };
                    var json = JsonSerializer.Serialize(response);
                    webView.CoreWebView2.PostWebMessageAsJson(json);
                }
                else if (type == "GetReportsForDate")
                {
                    var date = data.GetProperty("date").GetString();
                    var baseDir = Directory.GetCurrentDirectory();
                    var dateDir = Path.Combine(baseDir, "user-data", "reports", date!);
                    var reports = new List<object>();
                    int totalNamjap = 0;
                    if (Directory.Exists(dateDir))
                    {
                        var files = Directory.GetFiles(dateDir, "*.csv");
                        foreach (var f in files)
                        {
                            reports.Add(new { name = Path.GetFileName(f), path = f });
                            
                            try {
                                var lines = File.ReadAllLines(f);
                                foreach(var line in lines.Skip(1)) {
                                    if (string.IsNullOrWhiteSpace(line)) continue;
                                    var parts = line.Split(new[] { "\",\"" }, StringSplitOptions.None);
                                    if(parts.Length >= 6) {
                                        var njStr = parts[5].Trim('"');
                                        if (int.TryParse(njStr, out int nj)) {
                                            totalNamjap += nj;
                                        }
                                    }
                                }
                            } catch { }
                        }
                    }
                    var response = new { type = "ReportsForDate", reports = reports, totalNamjap = totalNamjap };
                    var json = JsonSerializer.Serialize(response);
                    webView.CoreWebView2.PostWebMessageAsJson(json);
                }
                else if (type == "GetReportContent")
                {
                    var path = data.GetProperty("path").GetString();
                    var content = File.Exists(path) ? File.ReadAllText(path) : "Report not found.";
                    var response = new { type = "ReportContent", content = content };
                    var json = JsonSerializer.Serialize(response);
                    webView.CoreWebView2.PostWebMessageAsJson(json);
                }
                else if (type == "LoadTrackerData")
                {
                    var baseDir = Directory.GetCurrentDirectory();
                    var trackerFile = Path.Combine(baseDir, "user-data", "tracker.json");
                    var content = File.Exists(trackerFile) ? File.ReadAllText(trackerFile) : "{}";
                    var response = new { type = "TrackerDataLoaded", data = content };
                    var json = JsonSerializer.Serialize(response);
                    webView.CoreWebView2.PostWebMessageAsJson(json);
                }
                else if (type == "SaveTrackerData")
                {
                    var trackerData = data.GetProperty("data").GetString();
                    if (!string.IsNullOrEmpty(trackerData))
                    {
                        var baseDir = Directory.GetCurrentDirectory();
                        var userDataDir = Path.Combine(baseDir, "user-data");
                        Directory.CreateDirectory(userDataDir);
                        File.WriteAllText(Path.Combine(userDataDir, "tracker.json"), trackerData);
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine(ex.Message);
            }
        }

        private async void LaunchAndPositionApp(string id, string paneId, string? executable, JsonElement bounds, string? arguments = null)
        {
            if (string.IsNullOrEmpty(executable)) return;

            try
            {
                IntPtr currentForeground = GetForegroundWindow();
                
                var startInfo = new ProcessStartInfo
                {
                    FileName = executable,
                    UseShellExecute = true
                };
                if (!string.IsNullOrEmpty(arguments)) {
                    startInfo.Arguments = arguments;
                }
                
                Process.Start(startInfo);

                IntPtr newHwnd = IntPtr.Zero;
                int retries = 150; // Wait up to 15 seconds for the window to appear
                while (retries > 0)
                {
                    await System.Threading.Tasks.Task.Delay(100);
                    IntPtr fg = GetForegroundWindow();
                    if (fg != IntPtr.Zero && fg != currentForeground && fg != new IntPtr(0x10010)) 
                    {
                        newHwnd = fg;
                        break;
                    }
                    retries--;
                }

                if (newHwnd != IntPtr.Zero)
                {
                    int style = GetWindowLong(newHwnd, GWL_STYLE);
                    SetWindowLong(newHwnd, GWL_STYLE, style & ~WS_MAXIMIZEBOX);

                    _paneWindows[paneId] = newHwnd;
                    _trackedApps.Add(new AppWindow { Id = id, Hwnd = newHwnd, State = "open" });
                    PositionWindow(newHwnd, bounds, true);
                }
                else
                {
                    webView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "AppLaunchFailed", id = id }));
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Failed to launch app: {ex.Message}");
            }
        }

        private void PositionWindow(IntPtr hWnd, JsonElement bounds, bool activate)
        {
            try 
            {
                PresentationSource source = PresentationSource.FromVisual(this);
                double dpiX = source?.CompositionTarget?.TransformToDevice.M11 ?? 1.0;
                double dpiY = source?.CompositionTarget?.TransformToDevice.M22 ?? 1.0;

                int x = (int)(bounds.GetProperty("x").GetDouble() * dpiX);
                int y = (int)(bounds.GetProperty("y").GetDouble() * dpiY);
                int w = (int)(bounds.GetProperty("width").GetDouble() * dpiX);
                int h = (int)(bounds.GetProperty("height").GetDouble() * dpiY);

                uint flags = SWP_SHOWWINDOW;
                if (!activate)
                {
                    flags |= 0x0010; // SWP_NOACTIVATE
                }
                else
                {
                    ShowWindow(hWnd, SW_RESTORE);
                    SetForegroundWindow(hWnd);
                }
                
                SetWindowPos(hWnd, HWND_TOPMOST, x, y, w, h, flags);
            }
            catch { }
        }
    }
}
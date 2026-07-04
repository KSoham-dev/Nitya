using System;
using System.Linq;
using System.Windows;
using Microsoft.Web.WebView2.Core;

namespace WorkPlace
{
    public partial class BrowserWindow : Window
    {
        private string _initialUrl;

        private readonly string[] allowedDomains = {
            "study.iitm.ac.in",
            "bitbucket.org",
            "drive.google.com",
            "github.com",
            "vercel.com",
            "vercel.app",
            "helloramp.ai",
            "blocksite.co",
            "web.whatsapp.com",
            "app.slack.com",
            "meet.google.com",
            "zoom.us",
            "localhost",
            "127.0.0.1",
            "0.0.0.0"
        };

        public BrowserWindow(string initialUrl)
        {
            InitializeComponent();
            _initialUrl = initialUrl;
            InitializeAsync();
        }

        async void InitializeAsync()
        {
            await webView.EnsureCoreWebView2Async(null);
            
            webView.CoreWebView2.NavigationStarting += CoreWebView2_NavigationStarting;
            webView.CoreWebView2.NewWindowRequested += CoreWebView2_NewWindowRequested;

            Navigate(_initialUrl);
        }

        public void Navigate(string url)
        {
            if (string.IsNullOrEmpty(url)) return;
            
            if (!url.StartsWith("http://") && !url.StartsWith("https://"))
                url = "https://" + url;

            if (webView.CoreWebView2 != null)
            {
                webView.CoreWebView2.Navigate(url);
            }
            else
            {
                _initialUrl = url;
            }
        }

        private void CoreWebView2_NavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
        {
            if (Uri.TryCreate(e.Uri, UriKind.Absolute, out Uri? uri))
            {
                if (!IsAllowedDomain(uri.Host))
                {
                    e.Cancel = true;
                    // Optional: Show a message that the domain is blocked
                    MessageBox.Show($"Navigation to {uri.Host} is blocked by your session rules.", "Blocked", MessageBoxButton.OK, MessageBoxImage.Warning);
                }
            }
        }

        private void CoreWebView2_NewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            e.Handled = true; // Prevent opening in external browser or popup
            
            if (Uri.TryCreate(e.Uri, UriKind.Absolute, out Uri? uri))
            {
                if (IsAllowedDomain(uri.Host))
                {
                    webView.CoreWebView2.Navigate(e.Uri);
                }
                else
                {
                    MessageBox.Show($"Popup to {uri.Host} is blocked by your session rules.", "Blocked", MessageBoxButton.OK, MessageBoxImage.Warning);
                }
            }
        }

        private bool IsAllowedDomain(string host)
        {
            foreach (var domain in allowedDomains)
            {
                if (host.Equals(domain, StringComparison.OrdinalIgnoreCase) || 
                    host.EndsWith("." + domain, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
            return false;
        }
    }
}

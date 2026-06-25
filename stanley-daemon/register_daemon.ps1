# PowerShell script to register the Stanley Native Messaging Daemon host in Google Chrome registry
$RegistryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.project.stanley"
$ManifestPath = "a:\Projects\SaaS\Bridgeway V2\STANLEY\stanley-daemon\com.project.stanley.json"

Write-Host "Registering Project Stanley Native Messaging Host..."
Write-Host "Registry path: $RegistryPath"
Write-Host "Manifest path: $ManifestPath"

# Create registry path if it doesn't exist
if (!(Test-Path $RegistryPath)) {
    New-Item -Path $RegistryPath -Force | Out-Null
}

# Set the default property to point to the manifest JSON
Set-ItemProperty -Path $RegistryPath -Name "(Default)" -Value $ManifestPath

Write-Host "Registration successful!" -ForegroundColor Green
Write-Host "Restart your Chrome browser to apply the registration changes."

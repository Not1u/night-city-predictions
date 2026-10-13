$ErrorActionPreference = 'Stop'
$assetRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../apps/web/public/assets/edgerunners2'))
New-Item -ItemType Directory -Path $assetRoot -Force | Out-Null
$assetBase = 'https://www.cyberpunk.net/build/images/edgerunners2/'
$assetSources = [ordered]@{
  'cover.jpg' = 'cover-pc-81ae3e53.jpg'
  'weak.png' = 'characters/weak-d06b35b1.png'
  'd.png' = 'characters/d-b06a2e35.png'
  'roman.png' = 'characters/roman-7104f5a9.png'
  'talia.png' = 'characters/talia-f6ecd1a0.png'
  'avida.png' = 'characters/avida-05ced57c.png'
  'sal.png' = 'characters/sal-3723999b.png'
  'jessie.png' = 'characters/jessie-764047b0.png'
  'kitano.png' = 'characters/kitano-57873497.png'
  'richard.png' = 'characters/richard-bb9af5a2.png'
  'kiril.png' = 'characters/kiril-516a2d43.png'
}
foreach ($asset in $assetSources.GetEnumerator()) {
  $assetPath = Join-Path $assetRoot $asset.Key
  if (!(Test-Path -LiteralPath $assetPath)) {
    Invoke-WebRequest -Uri ($assetBase + $asset.Value) -OutFile $assetPath
  }
  $assetBytes = [System.IO.File]::ReadAllBytes($assetPath)
  $validHeader = if ($asset.Key.EndsWith('.png')) { $assetBytes.Length -gt 8 -and $assetBytes[0] -eq 137 -and $assetBytes[1] -eq 80 } else { $assetBytes.Length -gt 3 -and $assetBytes[0] -eq 255 -and $assetBytes[1] -eq 216 }
  if (!$validHeader) { throw "Invalid image payload: $($asset.Key)" }
  Write-Output "$($asset.Key): $($assetBytes.Length) bytes verified"
}

$ErrorActionPreference = "Stop"

$base = "http://127.0.0.1:8000"
$adminToken = "dev-admin"

function PostJson($uri, $obj, $headers) {
  if ($headers) {
    return Invoke-RestMethod -Method Post -Uri $uri -Body ($obj | ConvertTo-Json -Depth 10) -ContentType "application/json" -Headers $headers
  } else {
    return Invoke-RestMethod -Method Post -Uri $uri -Body ($obj | ConvertTo-Json -Depth 10) -ContentType "application/json"
  }
}
function GetJson($uri) { return Invoke-RestMethod -Method Get -Uri $uri }

Write-Host "Ensuring server is reachable..."
$root = GetJson "$base/" | Out-Null

Write-Host "Large reseed (60 attrs, 15 teams)..."
try {
  PostJson "$base/admin/reseed-large" @{} @{ 'X-Admin-Token' = $adminToken } | Out-Null
} catch {
  Write-Host "reseed-large not found; ensure server updated. Attempting basic reseed-demo instead..."
  PostJson "$base/admin/reseed-demo" @{} @{ 'X-Admin-Token' = $adminToken } | Out-Null
}

Write-Host "Training model..."
$trainRes = PostJson "$base/train" @{} $null
Write-Host "Trained on rows:" $trainRes.trained_on_rows

Write-Host "Creating questionnaire..."
$q = PostJson "$base/questionnaires" @{ user_id = "sentiment-all-yes" } $null
$qid = $q.id

$attrs = GetJson "$base/attributes"
$map = @{}
foreach ($a in $attrs) { $map[$a.name] = $a.id }

# Sentiment-focused 12 mapping
$prefNames = @(
  'Community Engagement',
  'Possession Play',
  'Youth Academy',
  'National Team Contributors',
  'Iconic Players',
  'Atmospheric Stadium',
  'Budget Conscious',
  'Derby Specialists',
  'Big Match Temperament',
  'Sustainability Focus',
  'Historic Success',
  'Global Fanbase'
)

$responses = @()
foreach ($n in $prefNames) {
  if ($map.ContainsKey($n)) { $responses += @{ attribute_id = [int]$map[$n]; value = 1 } }
}

if ($responses.Count -eq 0) { throw "No matching attributes found for questionnaire mapping." }

PostJson "$base/questionnaires/$qid/responses" @{ responses = $responses } $null | Out-Null

Write-Host "Predicting..."
$pred = PostJson "$base/predict" @{ questionnaire_id = $qid } $null

$top = $pred.scores | Sort-Object -Property score -Descending | Select-Object -First 10
$top | ForEach-Object { "$(($_.team_name)): $([math]::Round($_.score*100,1))%" }

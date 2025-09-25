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

function GetJson($uri) {
  return Invoke-RestMethod -Method Get -Uri $uri
}

Write-Host "Reseeding large dataset (60 attrs, ~15 teams)..."
PostJson "$base/admin/reseed-large" @{} @{ 'X-Admin-Token' = $adminToken } | Out-Null

Write-Host "Training model..."
$trainRes = PostJson "$base/train" @{} $null
Write-Host "Trained on rows:" $trainRes.trained_on_rows

Write-Host "Creating questionnaire..."
$q = PostJson "$base/questionnaires" @{ user_id = "eval-1" } $null
$qid = $q.id

# Fetch attributes and build name->id map
$attrs = GetJson "$base/attributes"
$attrId = @{}
foreach ($a in $attrs) { $attrId[$a.name] = $a.id }

# 12-question preferences (1=yes, 0=no)
$pref = @{
  'High Press' = 1
  'Possession Play' = 1
  'Short Passing' = 1
  'Build From Back' = 1
  'Technical Midfield' = 1
  'Creative No10' = 1
  'Fullback Overlaps' = 1
  'Inverted Wingers' = 1
  'Sweeper Keeper' = 1
  'European Pedigree' = 1
  'Historic Success' = 1
  'Global Fanbase' = 1
}

$responses = @()
foreach ($k in $pref.Keys) {
  if ($attrId.ContainsKey($k)) {
    $responses += @{ attribute_id = [int]$attrId[$k]; value = [int]$pref[$k] }
  }
}

PostJson "$base/questionnaires/$qid/responses" @{ responses = $responses } $null | Out-Null

Write-Host "Predicting..."
$pred = PostJson "$base/predict" @{ questionnaire_id = $qid } $null

$top = $pred.scores | Sort-Object -Property score -Descending | Select-Object -First 8
$top | ForEach-Object { "$(($_.team_name)): $([math]::Round($_.score*100,1))%" }

$ErrorActionPreference = "Stop"

# Faster end-to-end seeding and training with ~30 attributes and 15 teams
$api = "http://127.0.0.1:8000"

function PostJson($uri, $obj) {
  return Invoke-RestMethod -Method Post -Uri $uri -Body ($obj | ConvertTo-Json -Depth 12) -ContentType "application/json"
}
function TryPostJson($uri, $obj) {
  try { Invoke-RestMethod -Method Post -Uri $uri -Body ($obj | ConvertTo-Json -Depth 12) -ContentType "application/json" | Out-Null } catch { }
}
function GetJson($uri) { return Invoke-RestMethod -Method Get -Uri $uri }

Write-Host "Checking server..."
GetJson "$api/" | Out-Null

# 30 attributes (mix of sentiment + style)
$attrNames = @(
  'Community Engagement','Possession Play','Youth Academy','National Team Contributors','Iconic Players',
  'Atmospheric Stadium','Budget Conscious','Derby Specialists','Big Match Temperament','Sustainability Focus',
  'Historic Success','Global Fanbase','High Press','Short Passing','Build From Back',
  'Technical Midfield','European Pedigree','Star Signings','Analytics Adoption','Sports Science',
  'Compact Defense','Low Block','Direct Play','Pace & Power','Long Passing',
  'Set Piece Threat','Home Fortress','Away Warriors','Modern Stadium','Manager Longevity',
  # added to reach 45
  'Counter-Attack','Wing Play','Through Balls','Crossing Frequency','Dribble-Oriented',
  'Long Shots','Inverted Wingers','Fullback Overlaps','Sweeper Keeper','Ball-Playing CB',
  'Aerial Dominance','Backroom Stability','Injury Resilience','Academy Integration','Tiki-Taka Tendencies'
)

Write-Host "Seeding attributes..."
foreach ($n in $attrNames) { TryPostJson "$api/attributes" @{ name = $n; description = $null; active = $true } }
$attrs = GetJson "$api/attributes"
$attrId = @{}
foreach ($a in $attrs) { $attrId[$a.name] = $a.id }

# 15 teams
$teamNames = @('Manchester City','Manchester United','Liverpool','Chelsea','Arsenal',
  'Tottenham Hotspur','Real Madrid','FC Barcelona','Atletico Madrid','Bayern Munich',
  'Borussia Dortmund','Paris Saint-Germain','Juventus','Inter Milan','AC Milan')

Write-Host "Seeding teams..."
foreach ($t in $teamNames) { TryPostJson "$api/teams" @{ name = $t; meta = @{ league = 'Top' } } }
$teams = GetJson "$api/teams"
$teamId = @{}
foreach ($t in $teams) { $teamId[$t.name] = $t.id }

# Assign attributes to teams deterministically
function AssignTeamAttrs($name) {
  $tid = $teamId[$name]
  if (-not $tid) { return }
  $map = @{}
  foreach ($an in $attrNames) {
    $prob = 0.5
    $lname = $name.ToLower()
    if ($lname.Contains('city') -or $lname.Contains('barcelona') -or $lname.Contains('bayern')) {
      if (@('Possession Play','High Press','Build From Back','Short Passing','Sports Science','Analytics Adoption') -contains $an) { $prob = 0.8 }
    }
    if ($lname.Contains('real') -or $lname.Contains('juventus') -or $lname.Contains('psg')) {
      if (@('Star Signings','Global Fanbase','Historic Success','European Pedigree','Iconic Players') -contains $an) { $prob = 0.85 }
    }
    if ($lname.Contains('united') -or $lname.Contains('arsenal')) {
      if (@('Youth Academy','National Team Contributors','Technical Midfield') -contains $an) { $prob = 0.75 }
    }
    if ($lname.Contains('atletico') -or $lname.Contains('inter')) {
      if (@('Compact Defense','Low Block','Big Match Temperament') -contains $an) { $prob = 0.8 }
    }
    # deterministic pseudo-random
    $hash = [System.BitConverter]::ToInt32((New-Object System.Security.Cryptography.SHA256Managed).ComputeHash([System.Text.Encoding]::UTF8.GetBytes($name+$an)),0)
    $r = ([math]::Abs($hash) % 100) / 100.0
    $val = $(if ($r -lt $prob) { 1 } else { 0 })
    $map[[string]$attrId[$an]] = $val
  }
  Invoke-RestMethod -Method Post -Uri "$api/teams/$tid/attributes" -Body (@{ attributes = $map } | ConvertTo-Json -Depth 12) -ContentType 'application/json' | Out-Null
}

Write-Host "Assigning team attributes..."
foreach ($t in $teamNames) { AssignTeamAttrs $t }

# Create 10 synthetic questionnaires for faster training
Write-Host "Creating synthetic questionnaires..."
$qIds = @()
for ($i=0; $i -lt 10; $i++) {
  $q = PostJson "$api/questionnaires" @{ user_id = "synthetic-$i" }
  $qid = $q.id
  $qIds += $qid
  $profiles = @(
    @('High Press','Possession Play','Short Passing','Build From Back'),
    @('Counter-Attack','Direct Play','Pace & Power','Long Passing'),
    @('Compact Defense','Low Block','Set Piece Threat'),
    @('Youth Academy','Budget Conscious','Community Engagement'),
    @('Star Signings','Global Fanbase','Iconic Players')
  )
  $profile = $profiles[$i % $profiles.Count]
  $chosen = New-Object System.Collections.Generic.HashSet[string]
  foreach ($x in $profile) { [void]$chosen.Add($x) }
  $rng = New-Object System.Random($i+321)
  $others = $attrNames | Sort-Object { $rng.Next() } | Select-Object -First 6
  foreach ($x in $others) { [void]$chosen.Add($x) }
  $responses = @()
  foreach ($n in $attrNames) {
    $val = 0
    if ($chosen.Contains($n)) { $val = $(if ($profile -contains $n) { 1 } else { if ($rng.NextDouble() -lt 0.3) { 1 } else { 0 } }) }
    $responses += @{ attribute_id = [int]$attrId[$n]; value = $val }
  }
  Invoke-RestMethod -Method Post -Uri "$api/questionnaires/$qid/responses" -Body (@{ responses = $responses } | ConvertTo-Json -Depth 12) -ContentType 'application/json' | Out-Null
}

# Feedback with guaranteed class variety: label top-overlap teams as supported
Write-Host "Submitting feedback..."
foreach ($qid in $qIds) {
  $scored = @()
  foreach ($t in $teamNames) {
    $tid = $teamId[$t]
    $team = GetJson "$api/teams/$tid"
    $tAttrs = $team.attributes
    $focus = @('High Press','Possession Play','Short Passing','Build From Back','Compact Defense','Low Block','Youth Academy','Star Signings','Global Fanbase','Iconic Players','Budget Conscious','Derby Specialists')
    $overlap = 0; $desired = 0
    foreach ($n in $focus) { if ($attrId.ContainsKey($n)) { $desired += 1; if ($tAttrs[[string]$attrId[$n]] -eq 1) { $overlap += 1 } } }
    $rate = 0; if ($desired -gt 0) { $rate = $overlap / $desired }
    $scored += [pscustomobject]@{ team=$t; team_id=$tid; rate=$rate }
  }
  $sorted = $scored | Sort-Object -Property rate -Descending
  $k = [Math]::Floor($sorted.Count / 2)
  $top = $sorted | Select-Object -First $k
  $bottom = $sorted | Select-Object -Skip $k
  foreach ($s in $top) { TryPostJson "$api/feedback" @{ questionnaire_id = $qid; team_id = $s.team_id; supported = 1 } }
  foreach ($s in $bottom) { TryPostJson "$api/feedback" @{ questionnaire_id = $qid; team_id = $s.team_id; supported = 0 } }
}

Write-Host "Training model..."
$train = PostJson "$api/train" @{}
Write-Host "Trained on rows:" $train.trained_on_rows

# User questionnaire with all-yes on 12 sentiment questions
Write-Host "Creating user questionnaire..."
$qUser = PostJson "$api/questionnaires" @{ user_id = "user-all-yes" }
$qidUser = $qUser.id
$pref12 = @('Community Engagement','Possession Play','Youth Academy','National Team Contributors','Iconic Players','Atmospheric Stadium','Budget Conscious','Derby Specialists','Big Match Temperament','Sustainability Focus','Historic Success','Global Fanbase')
$responses = @()
foreach ($n in $pref12) { if ($attrId.ContainsKey($n)) { $responses += @{ attribute_id = [int]$attrId[$n]; value = 1 } } }
Invoke-RestMethod -Method Post -Uri "$api/questionnaires/$qidUser/responses" -Body (@{ responses = $responses } | ConvertTo-Json -Depth 12) -ContentType 'application/json' | Out-Null

Write-Host "Predicting top matches..."
$pred = PostJson "$api/predict" @{ questionnaire_id = $qidUser }
$top = $pred.scores | Sort-Object -Property score -Descending | Select-Object -First 10
$top | ForEach-Object { "$(($_.team_name)): $([math]::Round($_.score*100,1))%" }

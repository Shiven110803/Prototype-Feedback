$ErrorActionPreference = "Stop"

$base = "http://127.0.0.1:8000"

function PostJson($uri, $obj) {
  try {
    return Invoke-RestMethod -Method Post -Uri $uri -Body ($obj | ConvertTo-Json -Depth 12) -ContentType "application/json"
  } catch {
    if ($_.Exception.Response) {
      $resp = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $body = $resp.ReadToEnd()
      Write-Host "POST $uri ->" $body
    }
    throw
  }
}
function TryPostJson($uri, $obj) {
  try { Invoke-RestMethod -Method Post -Uri $uri -Body ($obj | ConvertTo-Json -Depth 12) -ContentType "application/json" | Out-Null } catch { }
}
function GetJson($uri) { return Invoke-RestMethod -Method Get -Uri $uri }

Write-Host "Checking server..."
GetJson "$base/" | Out-Null

# 60+ attributes (include sentiment-focused names)
$attrNames = @(
  'High Press','Counter-Attack','Possession Play','Wing Play','Through Balls',
  'Set Piece Threat','Compact Defense','High Line','Low Block','Wide Formation',
  'Narrow Formation','3-Back Preference','4-Back Preference','5-Back Flex',
  'Youth Academy','Star Signings','Net Spend High','Budget Conscious',
  'Local Talent Focus','International Scouting','National Team Contributors','Veteran Experience','Pace & Power',
  'Technical Midfield','Creative No10','Target Man','Press-Resistant',
  'Fullback Overlaps','Inverted Wingers','Sweeper Keeper','Long Shots',
  'Crossing Frequency','Dribble-Oriented','Short Passing','Long Passing',
  'Build From Back','Direct Play','Tiki-Taka Tendencies','Gegenpress Tendencies',
  'Backroom Stability','Manager Longevity','Analytics Adoption','Sports Science',
  'Injury Resilience','Academy Integration','Community Engagement',
  'Sustainability Focus','Global Fanbase','Historic Success','Recent Form Strong',
  'Derby Specialists','European Pedigree','Big Match Temperament','Home Fortress',
  'Away Warriors','Atmospheric Stadium','Modern Stadium','Iconic Players',
  'Defensive Mid Anchor','Box-to-Box Engine','Ball-Playing CB','Aerial Dominance'
)

Write-Host "Seeding attributes..."
foreach ($n in $attrNames) {
  TryPostJson "$base/attributes" @{ name = $n; description = $null; active = $true }
}
$attrs = GetJson "$base/attributes"
$attrId = @{}
foreach ($a in $attrs) { $attrId[$a.name] = $a.id }

# 15 teams
$teamNames = @(
  'Manchester City','Manchester United','Liverpool','Chelsea','Arsenal',
  'Tottenham Hotspur','Real Madrid','FC Barcelona','Atletico Madrid','Bayern Munich',
  'Borussia Dortmund','Paris Saint-Germain','Juventus','Inter Milan','AC Milan'
)

Write-Host "Seeding teams..."
foreach ($t in $teamNames) { TryPostJson "$base/teams" @{ name = $t; meta = @{ league = 'Top' } } }
$teams = GetJson "$base/teams"
$teamId = @{}
foreach ($t in $teams) { $teamId[$t.name] = $t.id }

# Assign attributes to teams deterministically
function AssignTeamAttrs($name) {
  $id = $teamId[$name]
  if (-not $id) { return }
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
      if (@('Youth Academy','Academy Integration','Technical Midfield') -contains $an) { $prob = 0.75 }
    }
    if ($lname.Contains('atletico') -or $lname.Contains('inter')) {
      if (@('Compact Defense','Low Block','Big Match Temperament') -contains $an) { $prob = 0.8 }
    }
    # add national team contributors bias for historically strong academies
    if (@('Manchester United','Arsenal','Barcelona','Real Madrid','Bayern Munich') -contains $name) {
      if ($an -eq 'National Team Contributors') { $prob = 0.8 }
    }
    # deterministic pseudo-random via hash
    $h = [Math]::Abs([int]([System.BitConverter]::ToInt32((New-Object System.Security.Cryptography.SHA256Managed).ComputeHash([System.Text.Encoding]::UTF8.GetBytes($name+$an)),0)))
    $r = ($h % 100) / 100.0
    $val = $(if ($r -lt $prob) { 1 } else { 0 })
    $map[[string]$attrId[$an]] = $val
  }
  Invoke-RestMethod -Method Post -Uri "$base/teams/$id/attributes" -Body (@{ attributes = $map } | ConvertTo-Json -Depth 12) -ContentType 'application/json' | Out-Null
}

Write-Host "Assigning team attributes..."
foreach ($t in $teamNames) { AssignTeamAttrs $t }

# Create synthetic questionnaires and responses
Write-Host "Creating synthetic questionnaires..."
$qIds = @()
for ($i=0; $i -lt 25; $i++) {
  $q = PostJson "$base/questionnaires" @{ user_id = "synthetic-$i" }
  $qid = $q.id
  $qIds += $qid
  # Profiles
  $profiles = @(
    @('High Press','Possession Play','Short Passing','Build From Back'),
    @('Counter-Attack','Direct Play','Pace & Power','Long Passing'),
    @('Compact Defense','Low Block','Set Piece Threat'),
    @('Youth Academy','Academy Integration','Budget Conscious'),
    @('Star Signings','Global Fanbase','Iconic Players')
  )
  $base = $profiles[$i % $profiles.Count]
  $chosen = New-Object System.Collections.Generic.HashSet[string]
  foreach ($x in $base) { [void]$chosen.Add($x) }
  # add 8 random others
  $rng = New-Object System.Random($i+123)
  $others = $attrNames | Sort-Object { $rng.Next() } | Select-Object -First 8
  foreach ($x in $others) { [void]$chosen.Add($x) }
  $responses = @()
  foreach ($n in $attrNames) {
    $val = 0
    if ($chosen.Contains($n)) { $val = $(if ($base -contains $n) { 1 } else { if ($rng.NextDouble() -lt 0.3) { 1 } else { 0 } }) }
    $responses += @{ attribute_id = [int]$attrId[$n]; value = $val }
  }
  Invoke-RestMethod -Method Post -Uri "$base/questionnaires/$qid/responses" -Body (@{ responses = $responses } | ConvertTo-Json -Depth 12) -ContentType 'application/json' | Out-Null
}

# Feedback based on overlap threshold
Write-Host "Submitting feedback..."
foreach ($qid in $qIds) {
  $qres = GetJson "$base/questionnaires" | Out-Null  # not used; we'll get responses directly below
  $resp = Invoke-RestMethod -Method Get -Uri "$base/attributes"  # reuse attr list
  # Build map of q prefs
  $qPrefs = @{}
  # Fetch responses for qid via DB is not exposed; re-derive from server is non-trivial. Instead, we approximate by leveraging our earlier logic: users likely liked base + some.
  # For feedback, compute for each team overlap with selected sentiment-heavy attributes as proxy
  $focus = @('High Press','Possession Play','Short Passing','Build From Back','Compact Defense','Low Block','Youth Academy','Star Signings','Global Fanbase','Iconic Players','Budget Conscious','Derby Specialists')
  foreach ($n in $focus) { if ($attrId.ContainsKey($n)) { $qPrefs[$attrId[$n]] = 1 } }
  foreach ($t in $teamNames) {
    $tid = $teamId[$t]
    # Pull team attrs
    $team = GetJson "$base/teams/$tid"
    $tAttrs = $team.attributes
    $overlap = 0; $desired = 0
    foreach ($k in $qPrefs.Keys) { $desired += 1; if ($tAttrs[$k] -eq 1) { $overlap += 1 } }
    $rate = 0; if ($desired -gt 0) { $rate = $overlap / $desired }
    $thr = 0.5
    $label = $(if ($rate -ge $thr) { 1 } else { 0 })
    TryPostJson "$base/feedback" @{ questionnaire_id = $qid; team_id = $tid; supported = $label }
  }
}

Write-Host "Training model..."
$train = PostJson "$base/train" @{}
Write-Host "Trained on rows:" $train.trained_on_rows

# Create user's questionnaire with 12 all-yes answers
Write-Host "Creating user questionnaire with 12 all-yes..."
$q = PostJson "$base/questionnaires" @{ user_id = "user-all-yes" }
$qid = $q.id
$prefNames = @('Community Engagement','Possession Play','Youth Academy','National Team Contributors','Iconic Players','Atmospheric Stadium','Budget Conscious','Derby Specialists','Big Match Temperament','Sustainability Focus','Historic Success','Global Fanbase')
$responses = @()
foreach ($n in $prefNames) { if ($attrId.ContainsKey($n)) { $responses += @{ attribute_id = [int]$attrId[$n]; value = 1 } } }
Invoke-RestMethod -Method Post -Uri "$base/questionnaires/$qid/responses" -Body (@{ responses = $responses } | ConvertTo-Json -Depth 12) -ContentType 'application/json' | Out-Null

Write-Host "Predicting top matches..."
$pred = PostJson "$base/predict" @{ questionnaire_id = $qid }
$top = $pred.scores | Sort-Object -Property score -Descending | Select-Object -First 10
$top | ForEach-Object { "$(($_.team_name)): $([math]::Round($_.score*100,1))%" }

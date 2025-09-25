# Seed Cricket mode: 40 attributes, 8 national teams, synthetic questionnaires + feedback, then train model
# Usage: powershell -ExecutionPolicy Bypass -File .\seed_cricket.ps1 -ApiBase http://127.0.0.1:8000

param(
  [string]$ApiBase = "http://127.0.0.1:8000",
  [int]$Questionnaires = 40,
  [int]$Seed = 42
)

Write-Host "Seeding Cricket data to $ApiBase" -ForegroundColor Cyan

function PostJson($Url, $Body) {
  return Invoke-RestMethod -Uri $Url -Method Post -Body ($Body | ConvertTo-Json -Depth 8) -ContentType 'application/json' -ErrorAction Stop
}
function GetJson($Url) { return Invoke-RestMethod -Uri $Url -Method Get -ContentType 'application/json' -ErrorAction Stop }

function PostTeamAttributes($ApiBase, $TeamId, $Mapping) {
  # $Mapping is hashtable with numeric keys; serialize manually with keys as strings
  $pairs = @()
  foreach ($kv in $Mapping.GetEnumerator()) {
    $pairs += ('"{0}": {1}' -f ([string]$kv.Key), ([int]$kv.Value))
  }
  $json = '{"attributes": { ' + ($pairs -join ', ') + ' }}'
  return Invoke-RestMethod -Uri ("$ApiBase/teams/$TeamId/attributes") -Method Post -Body $json -ContentType 'application/json'
}

# 1) Clear existing DB schema (optional). Requires admin token, skipping by default.
# If you want to reset: uncomment next 2 lines and set $AdminToken
# $AdminToken = 'dev-admin'
# Invoke-RestMethod -Uri "$ApiBase/admin/reset-db" -Method Post -Headers @{ 'X-Admin-Token' = $AdminToken }

# 2) Create 40 Cricket attributes (idempotent-ish: ignore 400 errors on duplicates)
$attrNames = @(
  # Batting (10)
  'Aggressive Batting','Steady Batting','Middle-Order Stability','Finisher Ability','Strike Rotation',
  'Boundary Frequency','Spin-Hitting Skill','Pace-Hitting Skill','Left-Hand Variety','Batting Depth',
  # Bowling (12)
  'Fast Bowling','Swing Bowling','Reverse Swing','Short-Ball Effectiveness','Spin Bowling',
  'Wrist-Spin Threat','Finger-Spin Control','Powerplay Control','Middle-Overs Squeeze','Death Overs Bowling',
  'Bowling Accuracy','Bowling All-Rounders',
  # Fielding & Fitness (5)
  'Catching Consistency','Ground Fielding','Run-Out Threat','Wicketkeeping Excellence','Fitness/Availability',
  # Strategy & Mentality (7)
  'Tactical Flexibility','Adaptability To Conditions','Game Awareness','Big Match Wins','Leadership',
  'Calm Under Pressure','Innovation',
  # Culture & Legacy (6)
  'Rich Legacy','Recent Form','Youth Pipeline','Passionate Fanbase','Rivalry Pedigree','Sportsmanship'
)

$attrId = @{}
foreach ($n in $attrNames) {
  try {
    $resp = PostJson "$ApiBase/attributes" @{ name = $n; description = $null; active = $true }
    $attrId[$resp.name] = [int]$resp.id
  } catch {
    # try fetch id if already exists
    $all = GetJson "$ApiBase/attributes"
    $match = $all | Where-Object { $_.name -eq $n }
    if ($match) { $attrId[$match.name] = [int]$match.id }
  }
}

# 3) Create 8 national teams
$teams = 'India','Pakistan','Sri Lanka','West Indies','Australia','New Zealand','England','South Africa'
$teamId = @{}
foreach ($t in $teams) {
  try {
    $resp = PostJson "$ApiBase/teams" @{ name = $t; meta = @{ type = 'national'; sport = 'cricket' } }
    if ($resp -and $resp.name -and $resp.id) { $teamId[$resp.name] = [int]$resp.id }
  } catch {
    $allT = GetJson "$ApiBase/teams"
    $match = $allT | Where-Object { $_.name -eq $t }
    if ($match) { $teamId[$match.name] = [int]$match.id }
  }
}

# 4) Assign attributes to teams (light, opinionated defaults)
# Simple profiles (can be tuned later)
$profiles = @{
  'India'         = @('Spin Bowling','Wrist-Spin Threat','Strong Fielding','Back Young Players','Win In All Conditions','Rich Legacy','Passionate Fanbase','Leadership','Calm Under Pressure','Innovation','Batting Depth','Steady Batting','Strike Rotation','Wicketkeeping Excellence')
  'Pakistan'      = @('Fast Bowling','Reverse Swing','Short-Ball Effectiveness','Big Match Wins','Passionate Fanbase','Aggressive Batting','Bowling Accuracy','Leadership')
  'Sri Lanka'     = @('Spin Bowling','Finger-Spin Control','Game Awareness','Sportsmanship','Steady Batting','Adaptability To Conditions')
  'West Indies'   = @('Aggressive Batting','Boundary Frequency','Pace-Hitting Skill','Fast Bowling','Short-Ball Effectiveness','Powerplay Control','Passionate Fanbase')
  'Australia'     = @('Fast Bowling','Powerplay Control','Death Overs Bowling','Strong Fielding','Leadership','Win In All Conditions','Big Match Wins','Rich Legacy','Calm Under Pressure')
  'New Zealand'   = @('Catching Consistency','Ground Fielding','Game Awareness','Sportsmanship','Leadership','Adaptability To Conditions','Steady Batting')
  'England'       = @('Aggressive Batting','Innovation','Powerplay Control','Wrist-Spin Threat','Youth Pipeline','Recent Form')
  'South Africa'  = @('Fast Bowling','Catching Consistency','Ground Fielding','Batting Depth','Adaptability To Conditions','Calm Under Pressure')
}

foreach ($pair in $profiles.GetEnumerator()) {
  $name = $pair.Key
  $vals = $pair.Value
  $tid = $teamId[$name]
  if (-not $tid) { continue }
  $mapping = @{}
  foreach ($a in $attrId.GetEnumerator()) { $mapping[$a.Value] = 0 }
  foreach ($an in $vals) { if ($attrId.ContainsKey($an)) { $mapping[$attrId[$an]] = 1 } }
  # set (manual JSON to avoid ConvertTo-Json issues)
  PostTeamAttributes $ApiBase $tid $mapping | Out-Null
}

# 5) Create synthetic questionnaires + responses and feedback
$rand = New-Object System.Random($Seed)
for ($i=0; $i -lt $Questionnaires; $i++) {
  $q = PostJson "$ApiBase/questionnaires" @{ user_id = "cricket-$i" }
  $qid = [int]$q.id
  # Choose ~10-14 preferred attributes per user
  $pickCount = 12
  $selected = @{}
  while ($selected.Count -lt $pickCount) {
    $idx = $rand.Next(0, $attrNames.Count)
    $selected[$attrNames[$idx]] = 1
  }
  $responses = @()
  foreach ($an in $attrNames) {
    $val = if ($selected.ContainsKey($an)) { 1 } else { if ($rand.NextDouble() -lt 0.1) { 1 } else { 0 } }
    $responses += @{ attribute_id = $attrId[$an]; value = $val }
  }
  PostJson "$ApiBase/questionnaires/$qid/responses" @{ responses = $responses }

  # Feedback: compute scores for all teams, then enforce both classes per questionnaire
  $teamScores = @()
  foreach ($t in $teams) {
    $tid = $teamId[$t]
    if (-not $tid) { continue }
    $tResp = GetJson "$ApiBase/teams/$tid"
    $tAttrs = $tResp.attributes
    if (-not $tAttrs) { continue }
    $overlap = 0; $wanted = 0
    $attrKeys = @($tAttrs.PSObject.Properties.Name)
    foreach ($k in $attrKeys) {
      $aid = [int]$k
      $has = [int]$tAttrs[$k]
      $prefObj = $responses | Where-Object { $_.attribute_id -eq $aid }
      $pref = if ($prefObj) { [int]$prefObj.value } else { 0 }
      if ($pref -eq 1) { $wanted++ }
      if ($pref -eq 1 -and $has -eq 1) { $overlap++ }
    }
    $ratio = if ($wanted -gt 0) { [double]$overlap / [double]$wanted } else { 0.0 }
    $teamScores += [pscustomobject]@{ team_id = $tid; ratio = $ratio }
  }
  # Decide supported based on threshold, then enforce at least one positive and one negative
  $threshold = 0.30
  $labels = @{}
  $posCount = 0; $negCount = 0
  foreach ($row in $teamScores) {
    $label = if ($row.ratio -ge $threshold) { 1 } else { 0 }
    $labels[$row.team_id] = $label
    if ($label -eq 1) { $posCount++ } else { $negCount++ }
  }
  if ($posCount -eq 0 -and $teamScores.Count -gt 0) {
    # force top ratio to positive
    $top = ($teamScores | Sort-Object -Property ratio -Descending | Select-Object -First 1)
    $labels[$top.team_id] = 1; $posCount = 1
  }
  if ($negCount -eq 0 -and $teamScores.Count -gt 1) {
    # force lowest ratio to negative (if more than one team)
    $bot = ($teamScores | Sort-Object -Property ratio -Ascending | Select-Object -First 1)
    $labels[$bot.team_id] = 0; $negCount = 1
  }
  foreach ($row in $teamScores) {
    $lab = [int]$labels[$row.team_id]
    PostJson "$ApiBase/feedback" @{ questionnaire_id = $qid; team_id = $row.team_id; supported = $lab } | Out-Null
  }
}

# 6) Train
try {
  $trained = PostJson "$ApiBase/train?sport=cricket" @{}
  Write-Host "Model trained on $($trained.trained_on_rows) rows with $($trained.attributes.Count) attributes across $($trained.teams.Count) teams" -ForegroundColor Green
} catch {
  Write-Host "Training failed: $($_.Exception.Message)" -ForegroundColor Red
}

param(
  [string]$ApiBase = "http://127.0.0.1:8000"
)

$ErrorActionPreference = 'Stop'

function GetJson {
  param([string]$Url)
  return Invoke-RestMethod -Method GET -Uri $Url -ContentType 'application/json' -ErrorAction Stop
}
function PostJson {
  param([string]$Url, [object]$Body)
  $json = $Body | ConvertTo-Json -Depth 10
  return Invoke-RestMethod -Method POST -Uri $Url -Body $json -ContentType 'application/json' -ErrorAction Stop
}
function PostTeamAttributes {
  param([int]$TeamId, [hashtable]$AttrMap)
  # Custom JSON since PowerShell struggles with integer keys in hashtables
  $pairs = @()
  foreach ($k in $AttrMap.Keys) {
    $v = [int]$AttrMap[$k]
    $pairs += '"' + [string]$k + '": ' + [string]$v
  }
  $json = '{"attributes": {' + ($pairs -join ', ') + '}}'
  $url = "$ApiBase/teams/$TeamId/attributes"
  return Invoke-RestMethod -Method POST -Uri $url -Body $json -ContentType 'application/json' -ErrorAction Stop
}

Write-Host "Seeding F1: attributes, drivers, questionnaires, feedback..." -ForegroundColor Cyan

# 60 F1 attributes (personality/behavior/history)
$attrNames = @(
  'Calm vs Aggressive','Bold Overtakes','Consistency over Wins','Clutch Performances','Radio Composure','Rich Legacy (F1)','Leadership & Mentoring','Adaptability (Wet/Tricky)','Fan Engagement','Technical Feedback',
  'Race Starts','Tyre Management','Wet Weather Pace','Qualifying Pace','Team Player','Risk Appetite','Strategic Thinking','Mechanical Sympathy','Comeback Drives','Wheel-to-Wheel Control',
  'Patience in Traffic','Late Braking','Defensive Skills','Racecraft IQ','Setup Sensitivity','Learning Curve','Media Composure','Fan Favourite','Big-Team Experience','Underdog Spirit',
  'Sportsmanship','Data-Driven','Aggressive Defending','Clean Overtakes','Opportunistic','Pit Entry Precision','Pit Exit Precision','Energy Management','DRS Management','ERS Management',
  'Corner Entry Control','Corner Exit Control','Wet Tyre Mastery','Slick Tyre Mastery','Fuel Saving','Safety Car Restarts','Red Flag Resets','Pressure Handling','Championship Focus','Sprint Race Pace',
  'Street Circuit Pace','High-Speed Circuit Pace','Technical Circuit Pace','Bumpy Track Adaptation','Kerb Riding','Heat Management','Cold Management','Traffic Management','Backmarker Management','Overcut/Undercut Timing'
)

# Ensure attributes exist and capture their IDs
$existingAttrs = GetJson "$ApiBase/attributes"
$byName = @{}
foreach ($a in $existingAttrs) { $byName[$a.name] = $a.id }

foreach ($n in $attrNames) {
  if (-not $byName.ContainsKey($n)) {
    $res = PostJson "$ApiBase/attributes" @{ name = $n; description = $n; active = $true }
    $byName[$res.name] = $res.id
  }
}
$attrIds = @()
foreach ($n in $attrNames) { $attrIds += [int]$byName[$n] }

# Create F1 drivers as teams (kind=driver) with sport=f1
$drivers = @(
  @{ name='Max Verstappen';    meta = @{ sport='f1'; kind='driver'; country='Netherlands' } },
  @{ name='Lewis Hamilton';    meta = @{ sport='f1'; kind='driver'; country='United Kingdom' } },
  @{ name='Charles Leclerc';   meta = @{ sport='f1'; kind='driver'; country='Monaco' } },
  @{ name='Carlos Sainz';      meta = @{ sport='f1'; kind='driver'; country='Spain' } },
  @{ name='Lando Norris';      meta = @{ sport='f1'; kind='driver'; country='United Kingdom' } },
  @{ name='George Russell';    meta = @{ sport='f1'; kind='driver'; country='United Kingdom' } },
  @{ name='Fernando Alonso';   meta = @{ sport='f1'; kind='driver'; country='Spain' } },
  @{ name='Sergio Pérez';      meta = @{ sport='f1'; kind='driver'; country='Mexico' } },
  @{ name='Oscar Piastri';     meta = @{ sport='f1'; kind='driver'; country='Australia' } },
  @{ name='Daniel Ricciardo';  meta = @{ sport='f1'; kind='driver'; country='Australia' } }
)

$existingTeams = GetJson "$ApiBase/teams"
$teamsByName = @{}
foreach ($t in $existingTeams) { $teamsByName[$t.name] = $t }

$teamIdByName = @{}
foreach ($d in $drivers) {
  if ($teamsByName.ContainsKey($d.name)) {
    $teamIdByName[$d.name] = [int]$teamsByName[$d.name].id
  } else {
    $res = PostJson "$ApiBase/teams" @{ name = $d.name; meta = $d.meta }
    $teamIdByName[$res.name] = [int]$res.id
  }
}

# Driver persona biases (favour some attributes)
$bias = @{}
$bias['Max Verstappen']   = @('Bold Overtakes','Late Braking','Aggressive Defending','Qualifying Pace','Race Starts','Pressure Handling')
$bias['Lewis Hamilton']   = @('Tyre Management','Wet Weather Pace','Racecraft IQ','Comeback Drives','Pressure Handling','Big-Team Experience')
$bias['Charles Leclerc']  = @('Qualifying Pace','Bold Overtakes','Clean Overtakes','Street Circuit Pace','Pressure Handling')
$bias['Carlos Sainz']     = @('Strategic Thinking','Consistency over Wins','Mechanical Sympathy','Team Player')
$bias['Lando Norris']     = @('Adaptability (Wet/Tricky)','Media Composure','Fan Favourite','High-Speed Circuit Pace')
$bias['George Russell']   = @('Data-Driven','Championship Focus','Pressure Handling','Qualifying Pace')
$bias['Fernando Alonso']  = @('Opportunistic','Racecraft IQ','Defensive Skills','Strategic Thinking')
$bias['Sergio Pérez']     = @('Tyre Management','Traffic Management','Overcut/Undercut Timing','Defensive Skills','Patience in Traffic')
$bias['Oscar Piastri']    = @('Learning Curve','Clean Overtakes','Adaptability (Wet/Tricky)','Corner Exit Control')
$bias['Daniel Ricciardo'] = @('Late Braking','Opportunistic','Fan Engagement','Street Circuit Pace')

# Assign attributes (0/1) to each driver with bias
foreach ($name in $teamIdByName.Keys) {
  $id = $teamIdByName[$name]
  $map = @{}
  foreach ($aid in $attrIds) { $map[$aid] = 0 }
  $fav = $bias[$name]
  if ($fav) {
    foreach ($fname in $fav) { $fid = [int]$byName[$fname]; if ($fid) { $map[$fid] = 1 } }
  }
  # Add some random strengths to diversify
  foreach ($aid in ($attrIds | Get-Random -Count 8)) { $map[$aid] = 1 }
  # Persist
  PostTeamAttributes -TeamId $id -AttrMap $map | Out-Null
}

# Generate synthetic questionnaires and feedback
$QCount = 140
for ($qi=0; $qi -lt $QCount; $qi++) {
  $q = PostJson "$ApiBase/questionnaires" @{ user_id = "f1-seed-$qi" }
  $qid = [int]$q.id
  # Build user responses leaning to mixed preferences (API requires integer values; skip neutrals)
  $responses = @()
  foreach ($aid in $attrIds) {
    $val = (Get-Random -Minimum 0 -Maximum 100)
    if ($val -lt 50) { $v = 1 } else { $v = 0 }
    $responses += @{ attribute_id = $aid; value = $v }
  }
  PostJson "$ApiBase/questionnaires/$qid/responses" @{ responses = $responses } | Out-Null

  # Score each driver against responses
  $teamScores = @()
  foreach ($name in $teamIdByName.Keys) {
    $tid = $teamIdByName[$name]
    # pull team attributes
    $t = GetJson "$ApiBase/teams/$tid"
    $tAttrs = $t.attributes
    $match = 0; $total = 0
    foreach ($r in $responses) {
      $rid = [string]$r.attribute_id
      $prop = $tAttrs.PSObject.Properties[$rid]
      if ($null -ne $prop) {
        $want = [int]$r.value
        $have = [int]$prop.Value
        $total++
        if ($have -eq 1 -and $want -eq 1) { $match++ }
        if ($have -eq 0 -and $want -eq 0) { $match++ }
      }
    }
    $ratio = if ($total -gt 0) { [double]$match / [double]$total } else { 0.0 }
    $teamScores += [pscustomobject]@{ team_id=$tid; name=$name; match=$match; total=$total; ratio=$ratio }
  }
  # Label supported with threshold; enforce at least one positive and negative
  $threshold = 0.32
  $labels = @{}
  $pos=0; $neg=0
  foreach ($row in $teamScores) {
    $lab = if ($row.ratio -ge $threshold) { 1 } else { 0 }
    $labels[$row.team_id] = $lab
    if ($lab -eq 1) { $pos++ } else { $neg++ }
  }
  if ($pos -eq 0 -and $teamScores.Count -gt 0) {
    $top = ($teamScores | Sort-Object ratio | Select-Object -Last 1)
    $labels[$top.team_id] = 1; $pos = 1
  }
  if ($neg -eq 0 -and $teamScores.Count -gt 1) {
    $bot = ($teamScores | Sort-Object ratio | Select-Object -First 1)
    $labels[$bot.team_id] = 0; $neg = 1
  }
  foreach ($row in $teamScores) {
    $lab = [int]$labels[$row.team_id]
    PostJson "$ApiBase/feedback" @{ questionnaire_id = $qid; team_id = $row.team_id; supported = $lab } | Out-Null
  }
}

# Train model for sport=f1
$train = Invoke-RestMethod -Method POST -Uri "$ApiBase/train?sport=f1" -ContentType 'application/json' -ErrorAction Stop
Write-Host ("Trained F1 model on {0} rows" -f $train.trained_on_rows) -ForegroundColor Green

# Show brief analytics
$an = GetJson "$ApiBase/analytics"
Write-Host ("Totals: Q={0} Feedback={1} Teams={2} Attrs={3}" -f $an.total_questionnaires, $an.total_feedback, $an.total_teams, $an.total_attributes) -ForegroundColor DarkCyan

param(
  [Parameter(Mandatory=$true)]
  [string]$Answers, # Comma-separated 12 values of 0/1
  [string]$ApiBase = "http://127.0.0.1:8000"
)

$ErrorActionPreference = "Stop"

function PostJson($uri, $obj) {
  return Invoke-RestMethod -Method Post -Uri $uri -Body ($obj | ConvertTo-Json -Depth 12) -ContentType "application/json"
}
function GetJson($uri) { return Invoke-RestMethod -Method Get -Uri $uri }

# Parse answers
$vals = $Answers.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
if ($vals.Count -ne 12) {
  throw "Expected 12 answers (0/1), got $($vals.Count)."
}
$nums = @()
foreach ($v in $vals) {
  if ($v -notin @('0','1')) { throw "Invalid answer '$v'. Use only 0 or 1." }
  $nums += [int]$v
}

# The 12 sentiment-focused attributes (order matters)
$pref12 = @(
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

# Create questionnaire
$q = PostJson "$ApiBase/questionnaires" @{ user_id = "adhoc-$(Get-Date -Format yyyyMMddHHmmss)" }
$qid = $q.id

# Fetch attribute IDs
$attrs = GetJson "$ApiBase/attributes"
$attrId = @{}
foreach ($a in $attrs) { $attrId[$a.name] = $a.id }

# Build responses from provided answers
$responses = @()
for ($i=0; $i -lt 12; $i++) {
  $name = $pref12[$i]
  if (-not $attrId.ContainsKey($name)) { continue }
  $responses += @{ attribute_id = [int]$attrId[$name]; value = [int]$nums[$i] }
}
if ($responses.Count -eq 0) { throw "No matching attributes found in API for the 12-question mapping." }

PostJson "$ApiBase/questionnaires/$qid/responses" @{ responses = $responses } | Out-Null

# Predict
$pred = PostJson "$ApiBase/predict" @{ questionnaire_id = $qid }
$top = $pred.scores | Sort-Object -Property score -Descending | Select-Object -First 10
$top | ForEach-Object { "$(($_.team_name)): $([math]::Round($_.score*100,1))%" }

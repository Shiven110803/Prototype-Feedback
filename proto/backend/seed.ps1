$ErrorActionPreference = "Stop"

$base = "http://127.0.0.1:8000"

function PostJson($uri, $obj) {
  return Invoke-RestMethod -Method Post -Uri $uri -Body ($obj | ConvertTo-Json -Depth 10) -ContentType "application/json"
}

function GetJson($uri) {
  return Invoke-RestMethod -Method Get -Uri $uri
}

Write-Host "Seeding attributes..."
$attributesToCreate = @(
  @{ name = "Offensive Style"; description = "Prefers attacking play"; active = $true },
  @{ name = "Defense Focus"; description = "Strong defensive approach"; active = $true },
  @{ name = "Youth Development"; description = "Invests in young players"; active = $true },
  @{ name = "Local Talent"; description = "Prioritizes local players"; active = $true },
  @{ name = "Big Budget"; description = "High spending capacity"; active = $true }
)

foreach ($a in $attributesToCreate) {
  try { PostJson "$base/attributes" $a | Out-Null } catch { }
}
$attrs = GetJson "$base/attributes"
$attrByName = @{}
foreach ($a in $attrs) { $attrByName[$a.name] = $a.id }

Write-Host "Seeding teams..."
$teamsToCreate = @(
  @{ name = "City FC"; meta = @{ league = "Premier" } },
  @{ name = "United SC"; meta = @{ league = "Championship" } },
  @{ name = "Rovers"; meta = @{ league = "League One" } }
)

$teamIds = @{}
foreach ($t in $teamsToCreate) {
  try { $res = PostJson "$base/teams" $t; $teamIds[$res.name] = $res.id } catch { }
}
$teams = GetJson "$base/teams"
foreach ($t in $teams) { $teamIds[$t.name] = $t.id }

Write-Host "Assigning team attributes..."
 # City FC attributes
 $cityAttr = @{ }
 $cityAttr[ ([string]$attrByName['Offensive Style']) ] = 1
 $cityAttr[ ([string]$attrByName['Defense Focus']) ] = 0
 $cityAttr[ ([string]$attrByName['Youth Development']) ] = 1
 $cityAttr[ ([string]$attrByName['Local Talent']) ] = 0
 $cityAttr[ ([string]$attrByName['Big Budget']) ] = 1
 PostJson "$base/teams/$($teamIds['City FC'])/attributes" @{ attributes = $cityAttr } | Out-Null

 # United SC attributes
 $unitedAttr = @{ }
 $unitedAttr[ ([string]$attrByName['Offensive Style']) ] = 0
 $unitedAttr[ ([string]$attrByName['Defense Focus']) ] = 1
 $unitedAttr[ ([string]$attrByName['Youth Development']) ] = 0
 $unitedAttr[ ([string]$attrByName['Local Talent']) ] = 1
 $unitedAttr[ ([string]$attrByName['Big Budget']) ] = 0
 PostJson "$base/teams/$($teamIds['United SC'])/attributes" @{ attributes = $unitedAttr } | Out-Null

 # Rovers attributes
 $roversAttr = @{ }
 $roversAttr[ ([string]$attrByName['Offensive Style']) ] = 1
 $roversAttr[ ([string]$attrByName['Defense Focus']) ] = 1
 $roversAttr[ ([string]$attrByName['Youth Development']) ] = 0
 $roversAttr[ ([string]$attrByName['Local Talent']) ] = 1
 $roversAttr[ ([string]$attrByName['Big Budget']) ] = 0
 PostJson "$base/teams/$($teamIds['Rovers'])/attributes" @{ attributes = $roversAttr } | Out-Null

Write-Host "Creating questionnaire #1 and submitting responses..."
$q1 = PostJson "$base/questionnaires" @{ user_id = "user-demo-1" }
$q1Id = $q1.id
$responses1 = @(
  @{ attribute_id = $attrByName['Offensive Style']; value = 1 },
  @{ attribute_id = $attrByName['Defense Focus']; value = 0 },
  @{ attribute_id = $attrByName['Youth Development']; value = 1 },
  @{ attribute_id = $attrByName['Local Talent']; value = 0 },
  @{ attribute_id = $attrByName['Big Budget']; value = 1 }
)
PostJson "$base/questionnaires/$q1Id/responses" @{ responses = $responses1 } | Out-Null

Write-Host "Creating questionnaire #2 and submitting responses..."
$q2 = PostJson "$base/questionnaires" @{ user_id = "user-demo-2" }
$q2Id = $q2.id
$responses2 = @(
  @{ attribute_id = $attrByName['Offensive Style']; value = 0 },
  @{ attribute_id = $attrByName['Defense Focus']; value = 1 },
  @{ attribute_id = $attrByName['Youth Development']; value = 0 },
  @{ attribute_id = $attrByName['Local Talent']; value = 1 },
  @{ attribute_id = $attrByName['Big Budget']; value = 0 }
)
PostJson "$base/questionnaires/$q2Id/responses" @{ responses = $responses2 } | Out-Null

Write-Host "Submitting feedback..."
# From q1's perspective
PostJson "$base/feedback" @{ questionnaire_id = $q1Id; team_id = $teamIds['City FC']; supported = 1 } | Out-Null
PostJson "$base/feedback" @{ questionnaire_id = $q1Id; team_id = $teamIds['United SC']; supported = 0 } | Out-Null
PostJson "$base/feedback" @{ questionnaire_id = $q1Id; team_id = $teamIds['Rovers']; supported = 1 } | Out-Null

# From q2's perspective (different taste)
PostJson "$base/feedback" @{ questionnaire_id = $q2Id; team_id = $teamIds['City FC']; supported = 0 } | Out-Null
PostJson "$base/feedback" @{ questionnaire_id = $q2Id; team_id = $teamIds['United SC']; supported = 1 } | Out-Null
PostJson "$base/feedback" @{ questionnaire_id = $q2Id; team_id = $teamIds['Rovers']; supported = 1 } | Out-Null

Write-Host "Training model..."
$trainRes = PostJson "$base/train" @{}
Write-Host "Trained on rows:" $trainRes.trained_on_rows

Write-Host "Getting predictions for questionnaire #1..."
$pred = PostJson "$base/predict" @{ questionnaire_id = $q1Id }
$pred | ConvertTo-Json -Depth 10

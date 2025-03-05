<#
.DESCRIPTION
This script demonstrates a script that should be called directly
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$a,
    [int]$b = 6
)

Write-Host $a
Write-Host $b


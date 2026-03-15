param location string
param mapsAccountName string
param managedIdentityName string
param allowedOrigins array
param tags object = {}
param disableLocalAuth bool = false

var azureMapsDataReaderRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '423170ca-a8f6-4b0f-8487-9e4eb8f49bfa'
)

module userAssignedIdentity './modules/user-assigned-identity.bicep' = {
  name: 'azuremaps-user-assigned-identity'
  params: {
    location: location
    managedIdentityName: managedIdentityName
    tags: tags
  }
}

module mapsAccount './modules/maps-account.bicep' = {
  name: 'azuremaps-account'
  params: {
    location: location
    mapsAccountName: mapsAccountName
    managedIdentityResourceId: userAssignedIdentity.outputs.resourceId
    allowedOrigins: allowedOrigins
    tags: tags
    disableLocalAuth: disableLocalAuth
  }
}

module mapsDataReaderAssignment './modules/role-assignment.bicep' = {
  name: 'azuremaps-data-reader-assignment'
  params: {
    mapsAccountName: mapsAccountName
    principalId: userAssignedIdentity.outputs.principalId
    roleDefinitionId: azureMapsDataReaderRoleDefinitionId
  }
}

output mapsAccountId string = mapsAccount.outputs.resourceId
output mapsAccountClientId string = mapsAccount.outputs.clientId
output managedIdentityId string = userAssignedIdentity.outputs.resourceId
output managedIdentityClientId string = userAssignedIdentity.outputs.clientId
output managedIdentityPrincipalId string = userAssignedIdentity.outputs.principalId
output mapsDataReaderRoleAssignmentId string = mapsDataReaderAssignment.outputs.roleAssignmentId

import { Link } from "react-router";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~app/components/ui/breadcrumb";

interface PasswordBreadcrumbsProps {
  vaultId: string;
  vaultName: string;
  passwordName?: string;
  passwordSecretId?: string;
  currentPage?: string;
}

export function PasswordBreadcrumbs({
  vaultId,
  vaultName,
  passwordName,
  passwordSecretId,
  currentPage,
}: PasswordBreadcrumbsProps) {
  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        {/* Vaults link */}
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/">Vaults</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />

        {/* Vault name link or page */}
        {!passwordName && !currentPage ? (
          <BreadcrumbItem>
            <BreadcrumbPage>{vaultName}</BreadcrumbPage>
          </BreadcrumbItem>
        ) : (
          <>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={`/vault/${vaultId}/passwords`}>{vaultName}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </>
        )}

        {/* Password name link or page */}
        {passwordName && (
          <>
            {currentPage ? (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to={`/vault/${vaultId}/passwords/${passwordSecretId}`}>
                      {passwordName}
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
              </>
            ) : (
              <BreadcrumbItem>
                <BreadcrumbPage>{passwordName}</BreadcrumbPage>
              </BreadcrumbItem>
            )}
          </>
        )}

        {/* Current page (if provided) */}
        {currentPage && (
          <BreadcrumbItem>
            <BreadcrumbPage>{currentPage}</BreadcrumbPage>
          </BreadcrumbItem>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

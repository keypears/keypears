import { Link } from "react-router";
import { Home, Lock, Key } from "lucide-react";
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
            <Link to="/" className="flex items-center gap-1.5">
              <Home size={14} />
              Vaults
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />

        {/* Vault name link or page */}
        {!passwordName && !currentPage ? (
          <BreadcrumbItem>
            <BreadcrumbPage className="flex items-center gap-1.5">
              <Lock size={14} />
              {vaultName}
            </BreadcrumbPage>
          </BreadcrumbItem>
        ) : (
          <>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={`/vault/${vaultId}/passwords`} className="flex items-center gap-1.5">
                  <Lock size={14} />
                  {vaultName}
                </Link>
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
                    <Link to={`/vault/${vaultId}/passwords/${passwordSecretId}`} className="flex items-center gap-1.5">
                      <Key size={14} />
                      {passwordName}
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
              </>
            ) : (
              <BreadcrumbItem>
                <BreadcrumbPage className="flex items-center gap-1.5">
                  <Key size={14} />
                  {passwordName}
                </BreadcrumbPage>
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
